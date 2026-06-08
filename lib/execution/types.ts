import type { ExchangeName } from "../exchanges/types";

// ─── Execution Mode ──────────────────────────────────────

/** Only "paper" in V1/V2.  Real execution is Phase 4+. */
export type ExecutionMode = "paper";

// ─── Execution Status ────────────────────────────────────

export type ExecutionStatus = "pending" | "opened" | "closed" | "failed";

// ─── Opportunity Type (normalised, snake-case keys) ──────

export type ExecutionOpportunityType =
  | "spot-perp"
  | "cross-exchange"
  | "basis"
  | "unknown";

// ─── Execution Leg ───────────────────────────────────────

export type ExecutionLeg = {
  id: string;
  venue: ExchangeName;
  marketType: "spot" | "perp" | "future" | "unknown";
  side: "buy" | "sell" | "long" | "short";
  symbol: string;
  notionalUsd: number;
  estimatedEntryPrice: number;
  estimatedFee: number;
  estimatedSlippage: number;
};

// ─── Paper Execution ─────────────────────────────────────

export type PaperExecution = {
  id: string;
  opportunityId: string;
  opportunityType: ExecutionOpportunityType;
  symbol: string;
  base: string;
  quote: string;
  mode: "paper";
  status: ExecutionStatus;
  legs: ExecutionLeg[];
  sideDescription: string;
  exchanges: string[];
  estimatedAnnualizedRate: number;
  estimatedFundingRate: number;
  estimatedFees: number;
  estimatedSlippage: number;
  estimatedNetRate: number;
  riskTags: string[];
  createdAt: number;
  updatedAt: number;
  openedAt: number | null;
  closedAt: number | null;
  closeReason: string | null;
};

// ─── Inputs ──────────────────────────────────────────────

export type CreatePaperExecutionInput = {
  opportunityId: string;
  opportunityType: ExecutionOpportunityType;
  symbol: string;
  base: string;
  quote: string;
  legs: ExecutionLeg[];
  sideDescription: string;
  exchanges: string[];
  estimatedAnnualizedRate: number;
  estimatedFundingRate: number;
  estimatedFees: number;
  estimatedSlippage: number;
  estimatedNetRate: number;
  riskTags: string[];
};

export type ClosePaperExecutionInput = {
  id: string;
  closeReason?: string;
  now?: number;
};

// ─── Estimate Types ────────────────────────────────────

/** Cost model parameters for net return estimation. */
export type ExecutionCostModel = {
  /** Fee rate per leg as decimal (e.g. 0.001 = 0.1 %). Default 0.001. */
  feeRate?: number;
  /** Slippage rate per leg as decimal (e.g. 0.0005 = 0.05 %). Default 0.0005. */
  slippageRate?: number;
};

/** Holding period input for return annualization. */
export type HoldingPeriodInput = {
  /** Hours the position is held before closing. Default 8. */
  holdingHours?: number;
  /** Funding settlement interval in hours (e.g. 8 for most perps). Default 8. */
  fundingIntervalHours?: number;
};

/** Aggregate input for estimating a paper execution's returns. */
export type ExecutionEstimateInput = {
  opportunityType: ExecutionOpportunityType;
  /** Gross annualized rate as a percentage (e.g. 21.5 = 21.5 %). */
  annualizedRate: number;
  /** Funding rate as decimal (e.g. 0.001 = 0.1 %). */
  fundingRate: number;
  /** Total notional USD across all legs. */
  notionalUsd: number;
  /** Total estimated fees in USD. */
  fees: number;
  /** Total estimated slippage in USD. */
  slippage: number;
  costModel?: ExecutionCostModel;
  holding?: HoldingPeriodInput;
};

/** Result breakdown of an estimated paper execution. */
export type ExecutionEstimateResult = {
  /** Gross return in USD for the holding period. */
  grossReturn: number;
  /** Total fees in USD. */
  fees: number;
  /** Total slippage in USD. */
  slippage: number;
  /** Net return in USD (gross - fees - slippage). */
  netReturn: number;
  /** Decimal return for the holding period (netReturn / notionalUsd). */
  netRate: number;
  /** Annualized net rate as a percentage. */
  annualizedNetRate: number;
  /** Hours the estimate was calculated for. */
  holdingHours: number;
};
