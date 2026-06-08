import type { FundingHistoryRecord } from "../data/historyStore";
import type { ExchangeName } from "../exchanges/types";

const HOUR_MS = 60 * 60_000;

export type FundingHeatmapOptions = {
  now?: number;
  windowHours?: 1 | 24 | 168 | 720 | number;
  exchange?: "all" | ExchangeName;
  minSnapshotCount?: number;
  limit?: number;
};

export type FundingHeatmapRow = {
  exchange: ExchangeName;
  symbol: string;
  latestAnnualized: number;
  avgAnnualized: number;
  maxAnnualized: number;
  minAnnualized: number;
  snapshotCount: number;
  positiveFundingRatio: number;
  negativeFundingRatio: number;
  volatility: number;
  latestTimestamp: number;
};

export type FundingHeatmapResult = {
  windowHours: number;
  generatedAt: number;
  rows: FundingHeatmapRow[];
  groupedByExchange: Record<ExchangeName, FundingHeatmapRow[]>;
  topPositive: FundingHeatmapRow[];
  topNegative: FundingHeatmapRow[];
  mostVolatile: FundingHeatmapRow[];
  persistentPositive: FundingHeatmapRow[];
};

export function buildFundingHeatmap(
  historyRows: FundingHistoryRecord[],
  options: FundingHeatmapOptions = {}
): FundingHeatmapResult {
  const now = options.now ?? Date.now();
  const windowHours = options.windowHours ?? 24;
  const from = now - windowHours * HOUR_MS;
  const minSnapshotCount = options.minSnapshotCount ?? 1;
  const limit = normalizeLimit(options.limit);
  const grouped = groupBy(
    historyRows
      .filter((row) => row.timestamp >= from && row.timestamp <= now)
      .filter((row) => options.exchange === undefined || options.exchange === "all" || row.exchange === options.exchange),
    (row) => `${row.exchange}:${row.symbol}`
  );

  const rows = Array.from(grouped.values())
    .map(buildHeatmapRow)
    .filter((row) => row.snapshotCount >= minSnapshotCount)
    .sort((a, b) => a.exchange.localeCompare(b.exchange) || a.symbol.localeCompare(b.symbol));

  return {
    windowHours,
    generatedAt: now,
    rows,
    groupedByExchange: groupRowsByExchange(rows),
    topPositive: rows
      .slice()
      .sort((a, b) => b.latestAnnualized - a.latestAnnualized)
      .slice(0, limit),
    topNegative: rows
      .slice()
      .sort((a, b) => a.latestAnnualized - b.latestAnnualized)
      .slice(0, limit),
    mostVolatile: rows
      .slice()
      .sort((a, b) => b.volatility - a.volatility)
      .slice(0, limit),
    persistentPositive: rows
      .slice()
      .filter((row) => row.positiveFundingRatio >= 0.8)
      .sort((a, b) => b.positiveFundingRatio - a.positiveFundingRatio || b.avgAnnualized - a.avgAnnualized)
      .slice(0, limit)
  };
}

function buildHeatmapRow(rows: FundingHistoryRecord[]): FundingHeatmapRow {
  const sorted = rows.slice().sort((a, b) => a.timestamp - b.timestamp);
  const latest = sorted[sorted.length - 1];
  const values = sorted.map((row) => row.annualizedRate);
  const avgAnnualized = average(values);

  return {
    exchange: latest.exchange,
    symbol: latest.symbol,
    latestAnnualized: latest.annualizedRate,
    avgAnnualized,
    maxAnnualized: Math.max(...values),
    minAnnualized: Math.min(...values),
    snapshotCount: sorted.length,
    positiveFundingRatio: sorted.filter((row) => row.fundingRate > 0).length / sorted.length,
    negativeFundingRatio: sorted.filter((row) => row.fundingRate < 0).length / sorted.length,
    volatility: standardDeviation(values, avgAnnualized),
    latestTimestamp: latest.timestamp
  };
}

function groupRowsByExchange(rows: FundingHeatmapRow[]): Record<ExchangeName, FundingHeatmapRow[]> {
  return rows.reduce<Record<ExchangeName, FundingHeatmapRow[]>>(
    (acc, row) => {
      acc[row.exchange].push(row);
      return acc;
    },
    { Binance: [], OKX: [], Bybit: [] }
  );
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

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], avg: number): number {
  if (values.length <= 1) {
    return 0;
  }

  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || limit === undefined || limit <= 0) {
    return 20;
  }

  return Math.floor(limit);
}
