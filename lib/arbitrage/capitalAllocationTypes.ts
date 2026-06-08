/**
 * Capital Allocation Types — Alpha Phase A6
 *
 * Defines inputs, config, and results for allocating capital
 * across multiple arbitrage opportunities.
 *
 * Pure types — no logic.
 */

// ─── Single opportunity input ────────────────────────────

export type CapitalAllocationOpportunity = {
  /** Opportunity identifier. */
  id: string;

  /** Trading pair symbol (e.g. "BTC/USDT"). */
  symbol: string;

  /** Primary exchange (optional). */
  exchange?: string;

  /** Expected net APY percent (from Alpha-2). */
  expectedNetApy: number;

  /** Opportunity score 0-100 (from Alpha-1). */
  opportunityScore?: number;

  /** Risk score 0-100 (higher = riskier). */
  riskScore?: number;

  /** Liquidity score 0-100. */
  liquidityScore?: number;

  /** Maximum capital this opportunity can absorb in USD. */
  capacityUsd?: number;

  /** If true, this opportunity should not receive new capital. */
  shouldExit?: boolean;
};

// ─── Config ──────────────────────────────────────────────

export type CapitalAllocationConfig = {
  /**
   * Hard cap per position in USD.
   * Default 50,000.
   */
  maxPositionUsd?: number;

  /**
   * Minimum allocation per position in USD.
   * Default 1,000.
   * Opportunities below this are skipped.
   */
  minPositionUsd?: number;

  /**
   * Maximum fraction of total capital allocated to a single opportunity.
   * Default 0.5 (50 %).
   */
  maxAllocationPercentPerOpportunity?: number;

  /**
   * Minimum expected net APY for an opportunity to receive capital.
   * Default 8.
   */
  minExpectedNetApy?: number;

  /**
   * Maximum risk score allowed (optional).
   * Opportunities above this are skipped.
   */
  maxRiskScore?: number;

  /**
   * Fraction of total capital held in reserve (e.g. 0.1 = 10 %).
   * Default 0.1.
   */
  reserveRatio?: number;

  /** Weight for expectedNetApy in allocation formula. Default 0.6. */
  netApyWeight?: number;

  /** Weight for opportunityScore in allocation formula. Default 0.3. */
  scoreWeight?: number;

  /** Weight for riskScore (negative) in allocation formula. Default 0.1. */
  riskWeight?: number;
};

// ─── Input ───────────────────────────────────────────────

export type CapitalAllocationInput = {
  /** Total capital available in USD. */
  totalCapitalUsd: number;

  /** Reserve ratio override (default 0.1). */
  reserveRatio?: number;

  /** Candidate opportunities. */
  opportunities: CapitalAllocationOpportunity[];

  /** Allocation configuration. */
  config?: CapitalAllocationConfig;
};

// ─── Single allocation ──────────────────────────────────

export type CapitalAllocation = {
  /** Opportunity identifier. */
  opportunityId: string;

  /** Trading pair symbol. */
  symbol: string;

  /** Allocated USD amount. */
  allocatedUsd: number;

  /** Percentage of deployable capital (0-100). */
  allocationPercent: number;

  /** Expected net APY used for allocation. */
  expectedNetApy: number;

  /** Expected annual profit in USD (allocatedUsd * netApy / 100). */
  expectedAnnualProfitUsd: number;

  /** Human-readable reason for the allocation. */
  reason: string;
};

// ─── Skipped opportunity ────────────────────────────────

export type SkippedAllocation = {
  /** Opportunity identifier. */
  opportunityId: string;

  /** Trading pair symbol. */
  symbol: string;

  /** Why this opportunity was skipped. */
  reason: string;
};

// ─── Result ──────────────────────────────────────────────

export type CapitalAllocationResult = {
  /** Total capital considered. */
  totalCapitalUsd: number;

  /** Capital held in reserve. */
  reserveUsd: number;

  /** Capital available for deployment. */
  deployableCapitalUsd: number;

  /** Successful allocations. */
  allocations: CapitalAllocation[];

  /** Opportunities that were skipped. */
  skipped: SkippedAllocation[];

  /** Percentage of deployable capital utilised (0-100). */
  utilizationPercent: number;
};
