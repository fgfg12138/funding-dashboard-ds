/**
 * Opening Recommendation Types — Semi Phase 1
 *
 * Defines data structures for generating trade opening recommendations
 * that require user confirmation before execution.
 *
 * Pure types — no logic.
 */

// ─── Status ──────────────────────────────────────────────

export type RecommendationStatus = "recommended" | "not_recommended" | "blocked";

// ─── Single Recommendation ───────────────────────────────

export type OpeningRecommendation = {
  /** Opportunity identifier. */
  id: string;
  /** Trading pair symbol. */
  symbol: string;
  /** Primary exchange. */
  exchange: string;
  /** Recommendation status. */
  status: RecommendationStatus;
  /** Composite recommendation score 0–100. */
  score: number;
  /** Expected net APY percent. */
  expectedNetApy: number;
  /** Capital allocated to this opportunity in USD. */
  allocatedCapitalUsd: number;
  /** Expected annual profit in USD. */
  expectedAnnualProfitUsd: number;
  /** Overall portfolio risk level at generation time. */
  riskLevel: string;
  /** Human-readable reasons supporting the recommendation. */
  reasons: string[];
  /** Timestamp (ms) when the recommendation was generated. */
  generatedAt: number;
};

// ─── Report ──────────────────────────────────────────────

export type OpeningRecommendationReport = {
  /** All recommendations (recommended + blocked). */
  recommendations: OpeningRecommendation[];
  /** Count of recommended items. */
  recommendedCount: number;
  /** Count of blocked items. */
  blockedCount: number;
  /** Timestamp (ms) when the report was generated. */
  generatedAt: number;
};
