/**
 * Opportunity Ranking Types — Alpha Phase A1 / A2
 *
 * Defines the ranking result for unified arbitrage opportunities.
 * Pure types — no logic.
 */

// ─── Ranking Tier ────────────────────────────────────────

export type OpportunityRankingTier = "elite" | "strong" | "medium" | "weak";

// ─── Ranking Result ──────────────────────────────────────

export type OpportunityRankingResult = {
  opportunityId: string;
  symbol: string;

  /** 0-100 score based on funding rate magnitude and quality. */
  fundingScore: number;

  /** 0-100 score based on open interest / liquidity depth. */
  liquidityScore: number;

  /** 0-100 score based on 24h volume. */
  volumeScore: number;

  /** 0-100 score where higher = lower risk (inverted from risk penalties). */
  riskScore: number;

  /** 0-100 score based on market capacity (volume + OI combined). */
  capacityScore: number;

  /** Weighted total score 0-100. */
  totalScore: number;

  /** Tier derived from totalScore. */
  rankingTier: OpportunityRankingTier;

  // ─── Alpha A2: Net Profit (optional) ──────────────────

  /** Expected net APY after deducting all costs (percent). */
  expectedNetApy?: number;

  /** Annual net profit in USD. */
  netProfitUsd?: number;

  /** Trading fee cost in percentage points. */
  feeCost?: number;

  /** Slippage cost in percentage points. */
  slippageCost?: number;

  /** Borrow cost in percentage points. */
  borrowCost?: number;

  /** Capital cost in percentage points. */
  capitalCost?: number;
};
