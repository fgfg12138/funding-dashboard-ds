import type { RiskLevel } from "../opportunity/scoring";

export type TargetOpportunityType = "spot-perp" | "cross-exchange" | "basis";

/** A paper trading strategy template that controls simulation parameters. */
export type PaperStrategyTemplate = {
  id: string;
  name: string;
  description: string;
  /** Whether this template is the active one for /execution.  Only one can be true. */
  enabledPaperTrading: boolean;

  // — Opportunity filtering —
  targetOpportunityTypes: TargetOpportunityType[];

  // — Risk gate overrides —
  minScore: number;
  maxRiskLevel: RiskLevel;
  minAnnualizedNetRate: number;
  maxOpenExecutions: number;
  maxOpenNotionalUsd: number;
  maxSymbolExposureUsd: number;
  blockRiskTags: string[];

  // — Cost model overrides —
  defaultNotionalUsd: number;
  feeRate: number;
  slippageRate: number;
  holdingHours: number;

  // — Metadata —
  createdAt: number;
  updatedAt: number;
};

/** Create a new template with a given id and timestamp. */
export function buildPaperStrategyTemplate(
  name: string,
  description: string,
  id: string,
  now: number,
  overrides?: Partial<PaperStrategyTemplate>,
): PaperStrategyTemplate {
  return {
    id,
    name,
    description,
    enabledPaperTrading: false,
    targetOpportunityTypes: ["spot-perp", "cross-exchange", "basis"],
    minScore: 50,
    maxRiskLevel: "medium",
    minAnnualizedNetRate: 5,
    maxOpenExecutions: 10,
    maxOpenNotionalUsd: 100_000,
    maxSymbolExposureUsd: 20_000,
    blockRiskTags: ["abnormal-funding", "stale-data", "low-liquidity", "wide-spread"],
    defaultNotionalUsd: 1000,
    feeRate: 0.001,
    slippageRate: 0.0005,
    holdingHours: 8,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export const DEFAULT_PAPER_STRATEGIES: PaperStrategyTemplate[] = [
  buildPaperStrategyTemplate(
    "Conservative Funding",
    "保守策略：低评分/高风险机会不执行，小仓位，低敞口",
    "paper-conservative",
    0,
    {
      minScore: 65,
      maxRiskLevel: "low",
      minAnnualizedNetRate: 10,
      maxOpenExecutions: 5,
      maxOpenNotionalUsd: 50_000,
      maxSymbolExposureUsd: 10_000,
      defaultNotionalUsd: 500,
      blockRiskTags: ["abnormal-funding", "stale-data", "low-liquidity", "wide-spread"],
    },
  ),
  buildPaperStrategyTemplate(
    "Balanced Funding",
    "平衡策略：中等评分/风险接受，中等仓位",
    "paper-balanced",
    0,
    {
      minScore: 50,
      maxRiskLevel: "medium",
      minAnnualizedNetRate: 8,
      maxOpenExecutions: 8,
      maxOpenNotionalUsd: 80_000,
      maxSymbolExposureUsd: 20_000,
      defaultNotionalUsd: 1000,
      blockRiskTags: ["abnormal-funding", "stale-data"],
    },
  ),
  buildPaperStrategyTemplate(
    "Aggressive Funding",
    "激进策略：接受较低评分和高风险，大仓位，高敞口",
    "paper-aggressive",
    0,
    {
      minScore: 40,
      maxRiskLevel: "high",
      minAnnualizedNetRate: 5,
      maxOpenExecutions: 15,
      maxOpenNotionalUsd: 200_000,
      maxSymbolExposureUsd: 50_000,
      defaultNotionalUsd: 2000,
      blockRiskTags: ["abnormal-funding"],
    },
  ),
];
