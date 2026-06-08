import type { OpportunityHistoryRecord } from "../data/historyStore";

const HOUR_MS = 60 * 60_000;

export type OpportunityValidationOptions = {
  now?: number;
  windowHours?: 1 | 4 | 8 | 24 | number;
  limit?: number;
  filters?: OpportunityResearchFilters;
};

export type OpportunityResearchFilters = {
  minLatestAnnualized?: number;
  minSurvivalHours?: number;
  maxAnnualizedDecay?: number;
  maxAbsPriceSpreadChange?: number;
  type?: "all" | OpportunityHistoryRecord["type"];
};

export type OpportunityLifecycle = {
  id: string;
  type: OpportunityHistoryRecord["type"];
  symbol: string;
  label: string;
  exchangePair: string;
  direction?: string;
  survivalHours: number;
  maxAnnualized: number;
  minAnnualized: number;
  annualizedDecay: number;
  priceSpreadChange: number;
  latestAnnualized: number;
  latestPriceSpread: number;
  latestScore: number;
  qualityScore: number;
  snapshotCount: number;
  firstTimestamp: number;
  latestTimestamp: number;
};

export type OpportunityResearchResult = {
  windowHours: number;
  generatedAt: number;
  topStable: OpportunityLifecycle[];
  topDecayed: OpportunityLifecycle[];
  longestSurvival: OpportunityLifecycle[];
};

type HistoricalQualityScoreInput = {
  latestScore: number;
  survivalHours: number;
  windowHours: number;
  annualizedDecay: number;
  firstAnnualized: number;
  priceSpreadChange: number;
};

export function analyzeOpportunityLifecycles(
  rows: OpportunityHistoryRecord[],
  options: OpportunityValidationOptions = {}
): OpportunityLifecycle[] {
  const now = options.now ?? Date.now();
  const windowHours = options.windowHours ?? 24;
  const from = now - windowHours * HOUR_MS;
  const grouped = groupBy(
    rows.filter((row) => row.timestamp >= from && row.timestamp <= now),
    getOpportunityIdentity
  );

  return Array.from(grouped.entries())
    .map(([id, group]) => buildLifecycle(id, group, windowHours))
    .sort((a, b) => b.qualityScore - a.qualityScore || a.symbol.localeCompare(b.symbol));
}

export function buildOpportunityResearch(
  rows: OpportunityHistoryRecord[],
  options: OpportunityValidationOptions = {}
): OpportunityResearchResult {
  const limit = normalizeLimit(options.limit);
  const windowHours = options.windowHours ?? 24;
  const generatedAt = options.now ?? Date.now();
  const lifecycles = analyzeOpportunityLifecycles(rows, { ...options, now: generatedAt, windowHours });
  const filteredLifecycles = applyLifecycleFilters(lifecycles, options.filters);
  const stableLifecycles = applyLifecycleFilters(lifecycles, getStableFilters(options.filters));

  return {
    windowHours,
    generatedAt,
    topStable: stableLifecycles
      .slice()
      .sort((a, b) => b.qualityScore - a.qualityScore || a.annualizedDecay - b.annualizedDecay)
      .slice(0, limit),
    topDecayed: filteredLifecycles
      .slice()
      .sort((a, b) => b.annualizedDecay - a.annualizedDecay || b.latestAnnualized - a.latestAnnualized)
      .slice(0, limit),
    longestSurvival: filteredLifecycles
      .slice()
      .sort((a, b) => b.survivalHours - a.survivalHours || b.qualityScore - a.qualityScore)
      .slice(0, limit)
  };
}

export function calculateHistoricalQualityScore(input: HistoricalQualityScoreInput): number {
  const baseScore = clamp(input.latestScore / 100) * 65;
  const survivalScore = clamp(input.survivalHours / Math.max(input.windowHours, 1)) * 20;
  const decayRatio = input.annualizedDecay <= 0 ? 0 : input.annualizedDecay / Math.max(Math.abs(input.firstAnnualized), 1);
  const annualizedStabilityScore = clamp(1 - decayRatio) * 10;
  const priceStabilityScore = clamp(1 - Math.abs(input.priceSpreadChange) / 2) * 5;

  return Math.round(baseScore + survivalScore + annualizedStabilityScore + priceStabilityScore);
}

export function getOpportunityAnnualized(row: OpportunityHistoryRecord): number {
  return row.annualized ?? row.annualizedSpread ?? row.annualizedRate ?? 0;
}

function buildLifecycle(id: string, rows: OpportunityHistoryRecord[], windowHours: number): OpportunityLifecycle {
  const sorted = rows.slice().sort((a, b) => a.timestamp - b.timestamp);
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  const annualizedValues = sorted.map(getOpportunityAnnualized);
  const firstAnnualized = getOpportunityAnnualized(first);
  const latestAnnualized = getOpportunityAnnualized(latest);
  const survivalHours = round2((latest.timestamp - first.timestamp) / HOUR_MS);
  const priceSpreadChange = latest.priceSpread - first.priceSpread;

  return {
    id,
    type: latest.type,
    symbol: latest.symbol,
    label: getOpportunityLabel(latest),
    exchangePair: getExchangePair(latest),
    direction: latest.direction,
    survivalHours,
    maxAnnualized: Math.max(...annualizedValues),
    minAnnualized: Math.min(...annualizedValues),
    annualizedDecay: firstAnnualized - latestAnnualized,
    priceSpreadChange,
    latestAnnualized,
    latestPriceSpread: latest.priceSpread,
    latestScore: latest.score,
    qualityScore: calculateHistoricalQualityScore({
      latestScore: latest.score,
      survivalHours,
      windowHours,
      annualizedDecay: firstAnnualized - latestAnnualized,
      firstAnnualized,
      priceSpreadChange
    }),
    snapshotCount: sorted.length,
    firstTimestamp: first.timestamp,
    latestTimestamp: latest.timestamp
  };
}

function applyLifecycleFilters(
  lifecycles: OpportunityLifecycle[],
  filters: OpportunityResearchFilters | undefined
): OpportunityLifecycle[] {
  if (!filters) {
    return lifecycles;
  }

  return lifecycles
    .filter((item) => filters.type === undefined || filters.type === "all" || item.type === filters.type)
    .filter((item) => filters.minLatestAnnualized === undefined || item.latestAnnualized >= filters.minLatestAnnualized)
    .filter((item) => filters.minSurvivalHours === undefined || item.survivalHours >= filters.minSurvivalHours)
    .filter((item) => filters.maxAnnualizedDecay === undefined || item.annualizedDecay <= filters.maxAnnualizedDecay)
    .filter(
      (item) =>
        filters.maxAbsPriceSpreadChange === undefined ||
        Math.abs(item.priceSpreadChange) <= filters.maxAbsPriceSpreadChange
    );
}

function getStableFilters(filters: OpportunityResearchFilters | undefined): OpportunityResearchFilters {
  return {
    ...filters,
    minLatestAnnualized: filters?.minLatestAnnualized ?? 30,
    minSurvivalHours: filters?.minSurvivalHours ?? 4,
    maxAnnualizedDecay: filters?.maxAnnualizedDecay ?? 30
  };
}

function getOpportunityIdentity(row: OpportunityHistoryRecord): string {
  if (row.type === "cross-exchange") {
    return [row.type, row.symbol, row.shortExchange ?? "-", row.longExchange ?? "-"].join(":");
  }

  return [row.type, row.symbol, row.spotExchange ?? "-", row.perpExchange ?? "-"].join(":");
}

function getOpportunityLabel(row: OpportunityHistoryRecord): string {
  if (row.type === "cross-exchange") {
    return row.direction ?? `空 ${row.shortExchange ?? "-"} / 多 ${row.longExchange ?? "-"}`;
  }

  return `${row.spotExchange ?? "-"} spot + ${row.perpExchange ?? "-"} perp`;
}

function getExchangePair(row: OpportunityHistoryRecord): string {
  if (row.type === "cross-exchange") {
    return `${row.shortExchange ?? "-"} / ${row.longExchange ?? "-"}`;
  }

  return `${row.spotExchange ?? "-"} / ${row.perpExchange ?? "-"}`;
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

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || limit === undefined || limit <= 0) {
    return 10;
  }

  return Math.floor(limit);
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
