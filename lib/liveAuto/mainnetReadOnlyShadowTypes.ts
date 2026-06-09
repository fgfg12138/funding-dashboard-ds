/**
 * Mainnet Shadow Types — Binance Mainnet Read-Only Shadow
 *
 * Defines the report structure for the mainnet read-only shadow run.
 */

export type MainnetShadowReport = {
  /** Number of symbols processed. */
  symbolsProcessed: number;
  /** Number of viable opportunities found (netApy > 0). */
  opportunitiesFound: number;
  /** The top opportunity details. */
  topOpportunity?: {
    symbol: string;
    fundingRate: number;
    annualizedRate: number;
    netApy: number;
    score: number;
  };
  /** Average funding rate across all processed symbols. */
  averageFundingRate: number;
  /** Average net APY across all processed symbols. */
  averageNetApy: number;
  /** Risk engine summary. */
  riskSummary: {
    level: string;
    action: string;
  };
  /** Kill switch summary. */
  killSwitchSummary: {
    action: string;
    status: string;
  };
  /** Number of entry recommendations generated. */
  entryRecommendations: number;
  /** Number of exit recommendations generated. */
  exitRecommendations: number;
  /** Real orders executed (MUST be 0). */
  realOrdersExecuted: number;
  /** POST/PUT/DELETE requests attempted (MUST be 0). */
  postRequests: number;
  /** Timestamp when the shadow run completed. */
  generatedAt: number;
  /** Any errors encountered (non-fatal). */
  errors: string[];
};
