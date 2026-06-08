import type { FundingHistoryRecord, OpportunityHistoryRecord } from "../data/historyStore";
import {
  buildAlphaDiscovery,
  calculateAlphaScore,
  classifyAlpha,
  gradeAlphaScore,
  type AlphaOpportunity,
  type AlphaType
} from "./alphaScore";
import { buildFundingFactorResearch, type FundingFactorSample } from "./fundingFactors";

const HOUR_MS = 60 * 60_000;

export type AlphaScoreFactor =
  | "latestAnnualized"
  | "avgAnnualized"
  | "positiveFundingRatio"
  | "survivalHours"
  | "annualizedDecay"
  | "qualityScore"
  | "fundingVolatility";

export type AlphaScoreBreakdownItem = {
  factor: AlphaScoreFactor;
  value: number;
  contribution: number;
  maxContribution: number;
};

export type AlphaScoreBreakdown = {
  items: AlphaScoreBreakdownItem[];
  totalScore: number;
};

export type AlphaTimelineInput = {
  timestamp: number;
  sample: FundingFactorSample;
};

export type AlphaTimelinePoint = {
  timestamp: number;
  symbol: string;
  alphaScore: number;
  alphaGrade: string;
  alphaType: AlphaType;
  latestAnnualized: number;
  qualityScore: number;
};

export type AlphaComparisonRow = {
  symbol: string;
  id: string;
  alphaScore: number;
  alphaGrade: string;
  alphaType: AlphaType;
  survivalHours: number;
  annualizedDecay: number;
  qualityScore: number;
  fundingVolatility: number;
};

export type AlphaDrilldownInput = {
  id: string;
  opportunityRows: OpportunityHistoryRecord[];
  fundingRows: FundingHistoryRecord[];
  now?: number;
  windowHours?: number;
  compareSymbols?: string[];
};

export type AlphaDrilldownResult = {
  alpha?: AlphaOpportunity;
  breakdown?: AlphaScoreBreakdown;
  timeline: AlphaTimelinePoint[];
  comparison: AlphaComparisonRow[];
};

export function buildAlphaScoreBreakdown(sample: FundingFactorSample): AlphaScoreBreakdown {
  const items: AlphaScoreBreakdownItem[] = [
    {
      factor: "latestAnnualized",
      value: sample.latestAnnualized,
      contribution: clamp(sample.latestAnnualized / 120) * 25,
      maxContribution: 25
    },
    {
      factor: "avgAnnualized",
      value: sample.avgAnnualized,
      contribution: clamp(sample.avgAnnualized / 90) * 15,
      maxContribution: 15
    },
    {
      factor: "positiveFundingRatio",
      value: sample.positiveFundingRatio,
      contribution: clamp(sample.positiveFundingRatio) * 15,
      maxContribution: 15
    },
    {
      factor: "survivalHours",
      value: sample.survivalHours,
      contribution: clamp(sample.survivalHours / 24) * 15,
      maxContribution: 15
    },
    {
      factor: "annualizedDecay",
      value: sample.annualizedDecay,
      contribution: clamp(1 - Math.max(sample.annualizedDecay, 0) / 80) * 15,
      maxContribution: 15
    },
    {
      factor: "qualityScore",
      value: sample.qualityScore,
      contribution: clamp(sample.qualityScore / 100) * 10,
      maxContribution: 10
    },
    {
      factor: "fundingVolatility",
      value: sample.fundingVolatility,
      contribution: clamp(1 - sample.fundingVolatility / 100) * 5,
      maxContribution: 5
    }
  ];

  return {
    items: items.map((item) => ({ ...item, contribution: round2(item.contribution) })),
    totalScore: Math.round(items.reduce((sum, item) => sum + item.contribution, 0))
  };
}

export function buildAlphaTimeline(points: AlphaTimelineInput[]): AlphaTimelinePoint[] {
  return points
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(({ timestamp, sample }) => {
      const alphaScore = calculateAlphaScore(sample);
      return {
        timestamp,
        symbol: sample.symbol,
        alphaScore,
        alphaGrade: gradeAlphaScore(alphaScore),
        alphaType: classifyAlpha(sample),
        latestAnnualized: sample.latestAnnualized,
        qualityScore: sample.qualityScore
      };
    });
}

export function buildAlphaComparison(samples: FundingFactorSample[], symbols: string[]): AlphaComparisonRow[] {
  const alphaRows = buildAlphaDiscovery({ samples, limit: Math.max(samples.length, 1) }).topAlpha;

  return symbols
    .map((symbol) => {
      const normalized = normalizeCompareSymbol(symbol);
      return alphaRows.find((row) => row.symbol === normalized || row.symbol.startsWith(`${normalized}/`));
    })
    .filter((row): row is AlphaOpportunity => Boolean(row))
    .map((row) => ({
      symbol: row.symbol,
      id: row.id,
      alphaScore: row.alphaScore,
      alphaGrade: row.alphaGrade,
      alphaType: row.alphaType,
      survivalHours: row.survivalHours,
      annualizedDecay: row.annualizedDecay,
      qualityScore: row.qualityScore,
      fundingVolatility: row.fundingVolatility
    }));
}

export function buildAlphaDrilldown(input: AlphaDrilldownInput): AlphaDrilldownResult {
  const now = input.now ?? Date.now();
  const windowHours = input.windowHours ?? 24;
  const factors = buildFundingFactorResearch({
    opportunityRows: input.opportunityRows,
    fundingRows: input.fundingRows,
    now,
    windowHours
  });
  const selectedSample = factors.samples.find((sample) => sample.id === input.id);
  const alpha = selectedSample ? buildAlphaDiscovery({ samples: [selectedSample], limit: 1 }).topAlpha[0] : undefined;
  const selectedOpportunityRows = input.opportunityRows
    .filter((row) => getOpportunityIdentity(row) === input.id)
    .sort((a, b) => a.timestamp - b.timestamp);
  const timeline = buildAlphaTimeline(
    selectedOpportunityRows
      .map((row) => {
        const pointFactors = buildFundingFactorResearch({
          opportunityRows: input.opportunityRows.filter((item) => item.timestamp <= row.timestamp),
          fundingRows: input.fundingRows.filter((item) => item.timestamp <= row.timestamp),
          now: row.timestamp,
          windowHours
        });
        const sample = pointFactors.samples.find((item) => item.id === input.id);
        return sample ? { timestamp: row.timestamp, sample } : undefined;
      })
      .filter((point): point is AlphaTimelineInput => Boolean(point))
  );

  return {
    alpha,
    breakdown: selectedSample ? buildAlphaScoreBreakdown(selectedSample) : undefined,
    timeline,
    comparison: buildAlphaComparison(factors.samples, input.compareSymbols ?? getDefaultCompareSymbols(selectedSample))
  };
}

function getOpportunityIdentity(row: OpportunityHistoryRecord): string {
  if (row.type === "cross-exchange") {
    return [row.type, row.symbol, row.shortExchange ?? "-", row.longExchange ?? "-"].join(":");
  }

  return [row.type, row.symbol, row.spotExchange ?? "-", row.perpExchange ?? "-"].join(":");
}

function getDefaultCompareSymbols(sample: FundingFactorSample | undefined): string[] {
  const base = sample?.symbol.split("/")[0] ?? "BTC";
  return base === "BTC" ? ["BTC", "ETH"] : [base, "BTC"];
}

function normalizeCompareSymbol(symbol: string): string {
  const trimmed = symbol.trim().toUpperCase();
  return trimmed.includes("/") ? trimmed : `${trimmed}/USDT`;
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
