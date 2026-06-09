/**
 * Mainnet 24h Shadow Types — Binance Mainnet 24h Read-Only Shadow
 *
 * Defines the report structure for the 24-hour mainnet read-only shadow run.
 */

export type Mainnet24hShadowReport = {
  /** Number of cycles completed (target: 288). */
  cycles: number;
  /** Number of symbols processed per cycle. */
  symbolsProcessed: number;
  /** Total opportunities found across all cycles. */
  opportunitiesFound: number;
  /** Entry recommendations generated. */
  entryRecommendations: number;
  /** Exit recommendations generated. */
  exitRecommendations: number;
  /** Risk engine evaluation count (should be >= cycles). */
  riskEvaluations: number;
  /** Kill switch evaluation count (should be >= cycles). */
  killSwitchEvaluations: number;
  /** Average funding rate across all cycles. */
  averageFundingRate: number;
  /** Average net APY across all cycles. */
  averageNetApy: number;
  /** The single best opportunity seen. */
  topOpportunity?: {
    symbol: string;
    fundingRate: number;
    annualizedRate: number;
    netApy: number;
    score: number;
    cycle: number;
  };
  /** Non-fatal errors encountered. */
  errors: string[];
  /** POST/PUT/DELETE requests (MUST be 0). */
  postRequests: number;
  /** Real orders executed (MUST be 0). */
  realOrdersExecuted: number;
  /** Timestamp when the shadow run completed. */
  generatedAt: number;
};
