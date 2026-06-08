import type { ExchangeName } from "../exchanges/types";
import type { ExecutionOpportunityType } from "../execution/types";
import type { ScoreResult } from "../opportunity/scoring";
import type { RiskGateResult } from "../risk/riskGate";
import type { ExecutionEstimateResult } from "../execution/types";

// ─── Order Preview Mode ─────────────────────────────────

/** OrderPreview mode. Phase 4.1 only supports "preview". */
export type OrderPreviewMode = "preview";

// ─── Order Preview Leg ──────────────────────────────────

export type OrderPreviewLeg = {
  venue: ExchangeName;
  marketType: "spot" | "perp";
  side: "buy" | "sell" | "long" | "short";
  symbol: string;
  notionalUsd: number;
  estimatedEntryPrice: number;
  reduceOnly: boolean;
  orderType: "market" | "limit-preview";
  status: "preview-only";
};

// ─── Order Preview ──────────────────────────────────────

export type OrderPreview = {
  id: string;
  mode: "preview";
  sourceExecutionId?: string;
  opportunityId: string;
  symbol: string;
  base: string;
  quote: string;
  opportunityType: ExecutionOpportunityType;
  strategyName: string;
  legs: OrderPreviewLeg[];
  estimatedFees: number;
  estimatedSlippage: number;
  estimatedNetRate: number;
  scoringResult: ScoreResult;
  riskGateResult: RiskGateResult;
  estimateResult: ExecutionEstimateResult;
  accountRiskContextSource: string;
  /** Whether this preview can be submitted (riskGate.allowed). */
  submittable: boolean;
  warnings: string[];
  createdAt: number;
};

// ─── Input ──────────────────────────────────────────────

export type BuildOrderPreviewInput = {
  opportunityId: string;
  symbol: string;
  base: string;
  quote: string;
  opportunityType: ExecutionOpportunityType;
  strategyName: string;
  legs: OrderPreviewLeg[];
  estimatedFees: number;
  estimatedSlippage: number;
  estimatedNetRate: number;
  scoringResult: ScoreResult;
  riskGateResult: RiskGateResult;
  estimateResult: ExecutionEstimateResult;
  accountRiskContextSource: string;
  sourceExecutionId?: string;
};
