/**
 * Mainnet 7-Day Read-Only Shadow Types — Binance Mainnet 7-Day Read-Only Shadow
 *
 * Defines the report structure for the 7-day mainnet read-only shadow run.
 */

export type Mainnet7DayReadOnlyShadowReport = {
  /** Total cycles attempted (target: 2016). */
  cycles: number;
  /** Cycles that completed without error. */
  completedCycles: number;
  /** Number of unique symbols seen. */
  symbolsProcessed: number;
  /** Total opportunities found across all cycles. */
  opportunitiesFound: number;
  /** Entry recommendations generated. */
  entryRecommendations: number;
  /** Exit recommendations generated. */
  exitRecommendations: number;
  /** Risk engine evaluation count (should be >= completedCycles). */
  riskEvaluations: number;
  /** Kill switch evaluation count (should be >= completedCycles). */
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
  /** Maximum net APY seen. */
  maxNetApy: number;
  /** Minimum net APY seen. */
  minNetApy: number;
  /** Number of errors encountered. */
  errorCount: number;
  /** Non-fatal errors encountered. */
  errors: string[];
  /** POST requests (MUST be 0). */
  postRequests: number;
  /** PUT requests (MUST be 0). */
  putRequests: number;
  /** DELETE requests (MUST be 0). */
  deleteRequests: number;
  /** Real orders executed (MUST be 0). */
  realOrdersExecuted: number;
  /** Timestamp when the shadow run started. */
  startedAt: number;
  /** Timestamp when the shadow run completed. */
  endedAt: number;
};
