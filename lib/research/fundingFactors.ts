import type { FundingHistoryRecord, OpportunityHistoryRecord } from "../data/historyStore";
import {
  analyzeOpportunityLifecycles,
  getOpportunityAnnualized,
  type OpportunityLifecycle
} from "./opportunityValidation";

export const FACTOR_NAMES = [
  "latestAnnualized",
  "avgAnnualized",
  "fundingVolatility",
  "positiveFundingRatio",
  "volume24h",
  "openInterestUsd",
  "priceSpread",
  "score"
] as const;

export type FundingFactorName = (typeof FACTOR_NAMES)[number];
export type FactorBucketName = "Q1" | "Q2" | "Q3" | "Q4";

export type FundingFactorResearchInput = {
  opportunityRows: OpportunityHistoryRecord[];
  fundingRows: FundingHistoryRecord[];
  now?: number;
  windowHours?: number;
};

export type FundingFactorSample = {
  id: string;
  symbol: string;
  type: OpportunityHistoryRecord["type"];
  latestAnnualized: number;
  avgAnnualized: number;
  fundingVolatility: number;
  positiveFundingRatio: number;
  volume24h: number;
  openInterestUsd: number;
  priceSpread: number;
  score: number;
  survivalHours: number;
  annualizedDecay: number;
  qualityScore: number;
};

export type FundingFactorBucket = {
  factor: FundingFactorName;
  bucket: FactorBucketName;
  minValue: number;
  maxValue: number;
  avgFactorValue: number;
  sampleCount: number;
  avgSurvivalHours: number;
  avgAnnualizedDecay: number;
  avgQualityScore: number;
};

export type FundingFactorSummary = {
  factor: FundingFactorName;
  sampleCount: number;
  minValue: number;
  maxValue: number;
  avgValue: number;
  bestSurvivalBucket?: FactorBucketName;
  lowestDecayBucket?: FactorBucketName;
  bestQualityBucket?: FactorBucketName;
};

export type FundingFactorResearchResult = {
  windowHours: number;
  generatedAt: number;
  samples: FundingFactorSample[];
  factorSummaries: FundingFactorSummary[];
  bucketsByFactor: Record<FundingFactorName, FundingFactorBucket[]>;
};

const HOUR_MS = 60 * 60_000;

export function buildFundingFactorResearch(input: FundingFactorResearchInput): FundingFactorResearchResult {
  const now = input.now ?? Date.now();
  const windowHours = input.windowHours ?? 24;
  const from = now - windowHours * HOUR_MS;
  const opportunityRows = input.opportunityRows.filter((row) => row.timestamp >= from && row.timestamp <= now);
  const fundingRows = input.fundingRows.filter((row) => row.timestamp >= from && row.timestamp <= now);
  const latestOpportunityById = getLatestOpportunityRowsByLifecycleId(opportunityRows);
  const fundingBySymbol = groupBy(fundingRows, (row) => row.symbol);
  const samples = analyzeOpportunityLifecycles(opportunityRows, { now, windowHours }).map((lifecycle) =>
    buildFactorSample(lifecycle, latestOpportunityById.get(lifecycle.id), fundingBySymbol.get(lifecycle.symbol) ?? [])
  );
  const bucketsByFactor = FACTOR_NAMES.reduce<Record<FundingFactorName, FundingFactorBucket[]>>(
    (acc, factor) => {
      acc[factor] = buildFactorBuckets(samples, factor);
      return acc;
    },
    {} as Record<FundingFactorName, FundingFactorBucket[]>
  );

  return {
    windowHours,
    generatedAt: now,
    samples,
    factorSummaries: FACTOR_NAMES.map((factor) => buildFactorSummary(samples, factor, bucketsByFactor[factor])),
    bucketsByFactor
  };
}

function buildFactorSample(
  lifecycle: OpportunityLifecycle,
  latestOpportunity: OpportunityHistoryRecord | undefined,
  fundingRows: FundingHistoryRecord[]
): FundingFactorSample {
  const fundingAnnualized = fundingRows.map((row) => row.annualizedRate);
  const avgAnnualized = average(fundingAnnualized);

  return {
    id: lifecycle.id,
    symbol: lifecycle.symbol,
    type: lifecycle.type,
    latestAnnualized: lifecycle.latestAnnualized,
    avgAnnualized,
    fundingVolatility: standardDeviation(fundingAnnualized, avgAnnualized),
    positiveFundingRatio: fundingRows.length
      ? fundingRows.filter((row) => row.fundingRate > 0).length / fundingRows.length
      : 0,
    volume24h: latestOpportunity?.volume24h ?? 0,
    openInterestUsd: latestOpportunity?.openInterestUsd ?? 0,
    priceSpread: lifecycle.latestPriceSpread,
    score: lifecycle.latestScore,
    survivalHours: lifecycle.survivalHours,
    annualizedDecay: lifecycle.annualizedDecay,
    qualityScore: lifecycle.qualityScore
  };
}

function buildFactorBuckets(samples: FundingFactorSample[], factor: FundingFactorName): FundingFactorBucket[] {
  const sorted = samples
    .filter((sample) => Number.isFinite(sample[factor]))
    .slice()
    .sort((a, b) => a[factor] - b[factor]);

  if (sorted.length === 0) {
    return [];
  }

  return (["Q1", "Q2", "Q3", "Q4"] as FactorBucketName[])
    .map((bucket, index) => {
      const start = Math.floor((sorted.length * index) / 4);
      const end = Math.floor((sorted.length * (index + 1)) / 4);
      const bucketSamples = sorted.slice(start, Math.max(start + 1, end));
      return buildBucket(factor, bucket, bucketSamples);
    })
    .filter((bucket) => bucket.sampleCount > 0);
}

function buildBucket(
  factor: FundingFactorName,
  bucket: FactorBucketName,
  samples: FundingFactorSample[]
): FundingFactorBucket {
  const values = samples.map((sample) => sample[factor]);

  return {
    factor,
    bucket,
    minValue: Math.min(...values),
    maxValue: Math.max(...values),
    avgFactorValue: average(values),
    sampleCount: samples.length,
    avgSurvivalHours: average(samples.map((sample) => sample.survivalHours)),
    avgAnnualizedDecay: average(samples.map((sample) => sample.annualizedDecay)),
    avgQualityScore: average(samples.map((sample) => sample.qualityScore))
  };
}

function buildFactorSummary(
  samples: FundingFactorSample[],
  factor: FundingFactorName,
  buckets: FundingFactorBucket[]
): FundingFactorSummary {
  const values = samples.map((sample) => sample[factor]).filter(Number.isFinite);

  return {
    factor,
    sampleCount: values.length,
    minValue: values.length ? Math.min(...values) : 0,
    maxValue: values.length ? Math.max(...values) : 0,
    avgValue: average(values),
    bestSurvivalBucket: buckets.slice().sort((a, b) => b.avgSurvivalHours - a.avgSurvivalHours)[0]?.bucket,
    lowestDecayBucket: buckets.slice().sort((a, b) => a.avgAnnualizedDecay - b.avgAnnualizedDecay)[0]?.bucket,
    bestQualityBucket: buckets.slice().sort((a, b) => b.avgQualityScore - a.avgQualityScore)[0]?.bucket
  };
}

function getLatestOpportunityRowsByLifecycleId(rows: OpportunityHistoryRecord[]): Map<string, OpportunityHistoryRecord> {
  const grouped = groupBy(rows, getOpportunityIdentity);
  const latest = new Map<string, OpportunityHistoryRecord>();

  for (const [id, group] of grouped.entries()) {
    latest.set(
      id,
      group.slice().sort((a, b) => {
        const timestampDiff = b.timestamp - a.timestamp;
        return timestampDiff || getOpportunityAnnualized(b) - getOpportunityAnnualized(a);
      })[0]
    );
  }

  return latest;
}

function getOpportunityIdentity(row: OpportunityHistoryRecord): string {
  if (row.type === "cross-exchange") {
    return [row.type, row.symbol, row.shortExchange ?? "-", row.longExchange ?? "-"].join(":");
  }

  return [row.type, row.symbol, row.spotExchange ?? "-", row.perpExchange ?? "-"].join(":");
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
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) {
    return 0;
  }

  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function standardDeviation(values: number[], avg: number): number {
  const finite = values.filter(Number.isFinite);
  if (finite.length <= 1) {
    return 0;
  }

  return Math.sqrt(finite.reduce((sum, value) => sum + (value - avg) ** 2, 0) / finite.length);
}
