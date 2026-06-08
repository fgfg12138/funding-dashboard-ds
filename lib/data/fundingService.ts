import {
  calculateAnnualizedRate,
  calculateCrossExchangeFundingSpread,
  calculateSpotPerpOpportunity
} from "../arbitrage/calculations";
import { fetchAllFundingMarkets, fetchAllSpotMarkets } from "../exchanges";
import type {
  CrossExchangeOpportunity,
  DashboardSummary,
  DebugMarketRow,
  ExchangeName,
  ExchangeSourceStatus,
  FundingMarket,
  SpotMarket,
  SpotPerpOpportunity
} from "../exchanges/types";
import { saveHistorySnapshot } from "./historyStore";

const CACHE_TTL_MS = 45_000;
const EXCHANGES: ExchangeName[] = ["Binance", "OKX", "Bybit"];

export type FundingSnapshot = {
  fundingMarkets: FundingMarket[];
  spotMarkets: SpotMarket[];
  errors: string[];
  updatedAt: number;
  stale: boolean;
  sourceStatus: ExchangeSourceStatus;
};

export type MarketFetchResult<T> = {
  data: T[];
  error?: string;
  sourceStatus: ExchangeSourceStatus;
};

export type FundingSnapshotOptions = {
  cacheKey?: string;
  fetchFundingMarkets?: () => Promise<MarketFetchResult<FundingMarket>>;
  fetchSpotMarkets?: () => Promise<MarketFetchResult<SpotMarket>>;
  now?: number;
  saveHistory?: boolean;
  ttlMs?: number;
};

type SnapshotCacheEntry = {
  expiresAt: number;
  inFlight?: Promise<FundingSnapshot>;
  snapshot?: FundingSnapshot;
};

const snapshotCache = new Map<string, SnapshotCacheEntry>();

export async function getFundingSnapshot(options: FundingSnapshotOptions = {}): Promise<FundingSnapshot> {
  const cacheKey = options.cacheKey ?? "funding-snapshot";
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? CACHE_TTL_MS;
  const cached = snapshotCache.get(cacheKey);

  if (cached?.snapshot && cached.expiresAt > now) {
    return { ...cached.snapshot, stale: false };
  }

  if (cached?.inFlight) {
    return cached.inFlight;
  }

  const entry = cached ?? { expiresAt: 0 };
  const inFlight = loadFundingSnapshot(options, now).then(
    (snapshot) => {
      snapshotCache.set(cacheKey, {
        expiresAt: now + ttlMs,
        snapshot
      });
      return snapshot;
    },
    (error) => {
      if (entry.snapshot) {
        const staleSnapshot: FundingSnapshot = {
          ...entry.snapshot,
          errors: [...entry.snapshot.errors, error instanceof Error ? error.message : String(error)],
          sourceStatus: staleSourceStatus(),
          stale: true,
          updatedAt: now
        };
        snapshotCache.set(cacheKey, {
          expiresAt: now + Math.min(ttlMs, 15_000),
          snapshot: staleSnapshot
        });
        return staleSnapshot;
      }

      snapshotCache.delete(cacheKey);
      throw error;
    }
  );

  snapshotCache.set(cacheKey, {
    ...entry,
    inFlight
  });

  return inFlight;
}

export async function getCrossExchangeOpportunities(): Promise<CrossExchangeOpportunity[]> {
  const snapshot = await getFundingSnapshot();
  return buildCrossExchangeOpportunities(snapshot.fundingMarkets);
}

export async function getSpotPerpOpportunities(): Promise<SpotPerpOpportunity[]> {
  const snapshot = await getFundingSnapshot();
  return buildSpotPerpOpportunities(snapshot.spotMarkets, snapshot.fundingMarkets);
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const snapshot = await getFundingSnapshot();
  return buildDashboardSummary(snapshot.fundingMarkets);
}

export function buildDashboardSummary(fundingMarkets: FundingMarket[]): DashboardSummary {
  const cross = buildCrossExchangeOpportunities(fundingMarkets);
  const singleAnnualized = fundingMarkets.map((market) =>
    calculateAnnualizedRate(market.fundingRate, market.fundingIntervalHours)
  );
  const best = cross[0];

  return {
    totalPairs: new Set(fundingMarkets.map((market) => market.symbol)).size,
    maxAnnualizedSpread: best?.annualizedSpread ?? 0,
    bestDirection: best?.direction ?? "-",
    spreadAbove10Count: cross.filter((item) => item.annualizedSpread > 10).length,
    highestSingleAnnualized: Math.max(0, ...singleAnnualized)
  };
}

export async function getDebugMarketRows(): Promise<DebugMarketRow[]> {
  const snapshot = await getFundingSnapshot();
  return buildDebugMarketRows(snapshot.fundingMarkets);
}

export function buildDebugMarketRows(fundingMarkets: FundingMarket[]): DebugMarketRow[] {
  return fundingMarkets
    .map((market) => ({
      exchange: market.exchange,
      rawSymbol: market.rawSymbol,
      normalizedSymbol: market.symbol,
      fundingRate: market.fundingRate,
      annualizedRate: calculateAnnualizedRate(market.fundingRate, market.fundingIntervalHours),
      markPrice: market.markPrice,
      nextFundingTime: market.nextFundingTime,
      volume24h: market.volume24h,
      openInterestUsd: market.openInterestUsd
    }))
    .sort((a, b) => a.exchange.localeCompare(b.exchange) || a.normalizedSymbol.localeCompare(b.normalizedSymbol));
}

export function buildCrossExchangeOpportunities(markets: FundingMarket[]): CrossExchangeOpportunity[] {
  const grouped = groupBy(markets, (market) => market.symbol);

  return Array.from(grouped.entries())
    .map(([symbol, rows]) => calculateCrossExchangeFundingSpread(symbol, rows))
    .filter((item): item is CrossExchangeOpportunity => Boolean(item))
    .sort((a, b) => b.annualizedSpread - a.annualizedSpread);
}

export function buildSpotPerpOpportunities(spots: SpotMarket[], perps: FundingMarket[]): SpotPerpOpportunity[] {
  const spotByExchangeSymbol = new Map<string, SpotMarket>();
  for (const spot of spots) {
    const key = `${spot.exchange}:${spot.symbol}`;
    const existing = spotByExchangeSymbol.get(key);
    if (!existing || (spot.volume24h ?? 0) > (existing.volume24h ?? 0)) {
      spotByExchangeSymbol.set(key, spot);
    }
  }

  return perps
    .map((perp) => {
      const spot = spotByExchangeSymbol.get(`${perp.exchange}:${perp.symbol}`);
      return spot ? calculateSpotPerpOpportunity(spot, perp) : null;
    })
    .filter((item): item is SpotPerpOpportunity => Boolean(item))
    .sort((a, b) => b.annualized - a.annualized);
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

async function loadFundingSnapshot(options: FundingSnapshotOptions, now: number): Promise<FundingSnapshot> {
  const fetchFundingMarkets = options.fetchFundingMarkets ?? fetchAllFundingMarkets;
  const fetchSpotMarkets = options.fetchSpotMarkets ?? fetchAllSpotMarkets;
  const [funding, spot] = await Promise.all([fetchFundingMarkets(), fetchSpotMarkets()]);
  const snapshot: FundingSnapshot = {
    fundingMarkets: funding.data,
    spotMarkets: spot.data,
    errors: [funding.error, spot.error].filter((error): error is string => Boolean(error)),
    updatedAt: now,
    stale: false,
    sourceStatus: combineSourceStatus(funding.sourceStatus, spot.sourceStatus)
  };

  if (options.saveHistory !== false) {
    try {
      await saveHistorySnapshot({ fundingMarkets: funding.data, spotMarkets: spot.data });
    } catch (error) {
      console.warn("Failed to save funding history snapshot", error);
    }
  }

  return snapshot;
}

function combineSourceStatus(funding: ExchangeSourceStatus, spot: ExchangeSourceStatus): ExchangeSourceStatus {
  return EXCHANGES.reduce((status, exchange) => {
    status[exchange] = funding[exchange] === "failed" || spot[exchange] === "failed" ? "failed" : "ok";
    return status;
  }, {} as ExchangeSourceStatus);
}

function staleSourceStatus(): ExchangeSourceStatus {
  return EXCHANGES.reduce((status, exchange) => {
    status[exchange] = "stale";
    return status;
  }, {} as ExchangeSourceStatus);
}

export function resetFundingSnapshotCacheForTests() {
  snapshotCache.clear();
}
