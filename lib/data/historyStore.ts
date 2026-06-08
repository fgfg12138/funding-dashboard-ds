import { appendFile, mkdir, readFile, readdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  calculateAnnualizedRate,
  calculateCrossExchangeFundingSpread,
  calculateSpotPerpOpportunity
} from "../arbitrage/calculations";
import type { ExchangeName, FundingMarket, SpotMarket } from "../exchanges/types";

const DEFAULT_HISTORY_DIR = join(process.cwd(), ".data", "history");
const DEFAULT_LIMIT = 5000;
const DEFAULT_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type FundingHistoryRecord = {
  exchange: ExchangeName;
  symbol: string;
  fundingRate: number;
  annualizedRate: number;
  markPrice: number;
  volume24h?: number;
  openInterestUsd?: number;
  nextFundingTime: number;
  timestamp: number;
};

export type OpportunityHistoryRecord = {
  type: "cross-exchange" | "spot-perp";
  symbol: string;
  timestamp: number;
  annualized?: number;
  annualizedRate?: number;
  annualizedSpread?: number;
  priceSpread: number;
  score: number;
  direction?: string;
  shortExchange?: ExchangeName;
  longExchange?: ExchangeName;
  spotExchange?: ExchangeName;
  perpExchange?: ExchangeName;
  exchangeCount: number;
  volume24h?: number;
  openInterestUsd?: number;
};

export type HistoryStoreOptions = {
  historyDir?: string;
  fundingHistoryPath?: string;
  opportunityHistoryPath?: string;
  limit?: number;
  from?: number;
  to?: number;
  now?: number;
  retentionDays?: number;
};

export type SaveHistorySnapshotInput = HistoryStoreOptions & {
  fundingMarkets: FundingMarket[];
  spotMarkets: SpotMarket[];
  timestamp?: number;
};

export async function saveHistorySnapshot(input: SaveHistorySnapshotInput): Promise<void> {
  const timestamp = input.timestamp ?? Date.now();
  const historyDir = input.historyDir ?? DEFAULT_HISTORY_DIR;
  const fundingRows = input.fundingMarkets.map((market) => toFundingHistoryRecord(market, timestamp));
  const opportunityRows = buildOpportunityHistoryRecords(input.spotMarkets, input.fundingMarkets, timestamp);

  await Promise.all([
    appendJsonLines(input.fundingHistoryPath ?? getShardPath(historyDir, "funding", timestamp), fundingRows),
    appendJsonLines(input.opportunityHistoryPath ?? getShardPath(historyDir, "opportunities", timestamp), opportunityRows)
  ]);

  if (!input.fundingHistoryPath && !input.opportunityHistoryPath) {
    await cleanupHistoryShards(historyDir, input.now ?? timestamp, input.retentionDays ?? DEFAULT_RETENTION_DAYS);
  }
}

export async function queryFundingHistory(
  symbol: string,
  options: Pick<HistoryStoreOptions, "fundingHistoryPath" | "historyDir" | "limit" | "from" | "to"> = {}
): Promise<FundingHistoryRecord[]> {
  const rows = await readHistoryRecords<FundingHistoryRecord>("funding", options);
  return filterAndLimitRows(rows, symbol, options).sort(sortByTimestampThenExchange);
}

export async function queryAllFundingHistory(
  options: Pick<HistoryStoreOptions, "fundingHistoryPath" | "historyDir" | "limit" | "from" | "to"> = {}
): Promise<FundingHistoryRecord[]> {
  const rows = await readHistoryRecords<FundingHistoryRecord>("funding", options);
  return filterAndLimitRows(rows, undefined, options).sort(sortByTimestampThenExchange);
}

export async function queryOpportunityHistory(
  symbol: string,
  options: Pick<HistoryStoreOptions, "opportunityHistoryPath" | "historyDir" | "limit" | "from" | "to"> = {}
): Promise<OpportunityHistoryRecord[]> {
  const rows = await readHistoryRecords<OpportunityHistoryRecord>("opportunities", options);
  return filterAndLimitRows(rows, symbol, options).sort(sortByTimestampThenType);
}

export async function queryAllOpportunityHistory(
  options: Pick<HistoryStoreOptions, "opportunityHistoryPath" | "historyDir" | "limit" | "from" | "to"> = {}
): Promise<OpportunityHistoryRecord[]> {
  const rows = await readHistoryRecords<OpportunityHistoryRecord>("opportunities", options);
  return filterAndLimitRows(rows, undefined, options).sort(sortByTimestampThenType);
}

function toFundingHistoryRecord(market: FundingMarket, timestamp: number): FundingHistoryRecord {
  return {
    exchange: market.exchange,
    symbol: market.symbol,
    fundingRate: market.fundingRate,
    annualizedRate: calculateAnnualizedRate(market.fundingRate, market.fundingIntervalHours),
    markPrice: market.markPrice,
    volume24h: market.volume24h,
    openInterestUsd: market.openInterestUsd,
    nextFundingTime: market.nextFundingTime,
    timestamp
  };
}

function buildOpportunityHistoryRecords(
  spots: SpotMarket[],
  perps: FundingMarket[],
  timestamp: number
): OpportunityHistoryRecord[] {
  return [
    ...buildCrossOpportunityHistory(perps, timestamp),
    ...buildSpotPerpOpportunityHistory(spots, perps, timestamp)
  ];
}

function buildCrossOpportunityHistory(markets: FundingMarket[], timestamp: number): OpportunityHistoryRecord[] {
  const grouped = groupBy(markets, (market) => market.symbol);

  return Array.from(grouped.entries())
    .map(([symbol, rows]) => calculateCrossExchangeFundingSpread(symbol, rows))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((opportunity) => ({
      type: "cross-exchange" as const,
      symbol: opportunity.symbol,
      timestamp,
      annualized: opportunity.annualizedSpread,
      annualizedSpread: opportunity.annualizedSpread,
      priceSpread: opportunity.priceSpread,
      score: opportunity.score,
      direction: opportunity.direction,
      shortExchange: opportunity.shortExchange,
      longExchange: opportunity.longExchange,
      exchangeCount: opportunity.exchangeCount,
      volume24h: opportunity.volume24h,
      openInterestUsd: opportunity.openInterestUsd
    }));
}

function buildSpotPerpOpportunityHistory(
  spots: SpotMarket[],
  perps: FundingMarket[],
  timestamp: number
): OpportunityHistoryRecord[] {
  const spotsByExchangeSymbol = new Map<string, SpotMarket>();
  for (const spot of spots) {
    const key = `${spot.exchange}:${spot.symbol}`;
    const existing = spotsByExchangeSymbol.get(key);
    if (!existing || (spot.volume24h ?? 0) > (existing.volume24h ?? 0)) {
      spotsByExchangeSymbol.set(key, spot);
    }
  }

  return perps
    .map((perp) => {
      const spot = spotsByExchangeSymbol.get(`${perp.exchange}:${perp.symbol}`);
      return spot ? calculateSpotPerpOpportunity(spot, perp) : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((opportunity) => ({
      type: "spot-perp" as const,
      symbol: opportunity.symbol,
      timestamp,
      annualized: opportunity.annualized,
      annualizedRate: opportunity.annualized,
      priceSpread: opportunity.priceSpread,
      score: opportunity.score,
      spotExchange: opportunity.spotExchange,
      perpExchange: opportunity.perpExchange,
      exchangeCount: opportunity.exchangeCount,
      volume24h: opportunity.volume24h
    }));
}

async function appendJsonLines<T>(path: string, rows: T[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

async function readHistoryRecords<T extends { timestamp: number }>(
  kind: "funding" | "opportunities",
  options: Pick<HistoryStoreOptions, "fundingHistoryPath" | "opportunityHistoryPath" | "historyDir">
): Promise<T[]> {
  const explicitPath = kind === "funding" ? options.fundingHistoryPath : options.opportunityHistoryPath;
  if (explicitPath) {
    return readJsonLines<T>(explicitPath);
  }

  const historyDir = options.historyDir ?? DEFAULT_HISTORY_DIR;
  const files = await listShardFiles(historyDir, kind);
  const rows = await Promise.all(files.map((file) => readJsonLines<T>(join(historyDir, file))));
  return rows.flat();
}

async function readJsonLines<T>(path: string): Promise<T[]> {
  let content = "";
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseJsonLine)
    .filter((row): row is T => Boolean(row));
}

async function listShardFiles(historyDir: string, kind: "funding" | "opportunities"): Promise<string[]> {
  let files: string[] = [];
  try {
    files = await readdir(historyDir);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return files
    .filter((file) => getShardInfo(file)?.kind === kind)
    .sort((a, b) => b.localeCompare(a));
}

async function cleanupHistoryShards(historyDir: string, now: number, retentionDays: number): Promise<void> {
  const cutoff = startOfUtcDay(now) - retentionDays * DAY_MS;
  const files = await listAllShardFiles(historyDir);

  await Promise.all(
    files.map(async (file) => {
      const shard = getShardInfo(file);
      if (shard && shard.timestamp < cutoff) {
        await unlink(join(historyDir, file));
      }
    })
  );
}

async function listAllShardFiles(historyDir: string): Promise<string[]> {
  try {
    const files = await readdir(historyDir);
    return files.filter((file) => Boolean(getShardInfo(file)));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function parseJsonLine<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T;
  } catch {
    return null;
  }
}

function filterAndLimitRows<T extends { symbol: string; timestamp: number }>(
  rows: T[],
  symbol: string | undefined,
  options: Pick<HistoryStoreOptions, "limit" | "from" | "to">
): T[] {
  const limit = normalizeLimit(options.limit);
  return rows
    .filter((row) => symbol === undefined || row.symbol === symbol)
    .filter((row) => options.from === undefined || row.timestamp >= options.from)
    .filter((row) => options.to === undefined || row.timestamp <= options.to)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || limit === undefined || limit <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.floor(limit);
}

function getShardPath(historyDir: string, kind: "funding" | "opportunities", timestamp: number): string {
  return join(historyDir, `${kind}-${formatShardDate(timestamp)}.jsonl`);
}

function formatShardDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function getShardInfo(file: string): { kind: "funding" | "opportunities"; timestamp: number } | null {
  const match = /^(funding|opportunities)-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(file);
  if (!match) {
    return null;
  }

  return {
    kind: match[1] as "funding" | "opportunities",
    timestamp: Date.parse(`${match[2]}T00:00:00.000Z`)
  };
}

function startOfUtcDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }
  return grouped;
}

function sortByTimestampThenExchange(a: FundingHistoryRecord, b: FundingHistoryRecord): number {
  return a.timestamp - b.timestamp || a.exchange.localeCompare(b.exchange);
}

function sortByTimestampThenType(a: OpportunityHistoryRecord, b: OpportunityHistoryRecord): number {
  return a.timestamp - b.timestamp || a.type.localeCompare(b.type);
}
