/**
 * Opportunity Ranking Types — Alpha Phase A1
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
};
