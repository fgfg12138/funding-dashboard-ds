/**
 * Capital Manager Types — Live Phase 5
 *
 * Defines data structures for automated capital management:
 * reserve, utilisation, position sizing, and compounding.
 *
 * Pure types — no logic.
 */

// ─── Config ──────────────────────────────────────────────

export type LiveCapitalManagerConfig = {
  /** Total capital available in USD. */
  totalCapitalUsd: number;

  /** Fraction held in reserve (e.g. 0.1 = 10 %). Default 0.1. */
  reserveRatio?: number;

  /** Maximum utilisation percentage (0–100). Default 90. */
  maxUtilizationPercent?: number;

  /** Hard cap per position in USD. Default 50,000. */
  maxPositionUsd?: number;

  /** Minimum allocation per position in USD. Default 1,000. */
  minPositionUsd?: number;

  /** Maximum % of total capital per opportunity. Default 0.5. */
  maxAllocationPercentPerOpportunity?: number;

  /** Whether realised PnL and funding are added back to available capital. Default true. */
  compoundProfits?: boolean;

  /** Minimum available capital before blocking new allocations. Default 0. */
  minAvailableCapitalUsd?: number;
};

// ─── Capital State ──────────────────────────────────────

export type CapitalState = {
  /** Total capital base. */
  totalCapitalUsd: number;
  /** Capital held in reserve. */
  reserveUsd: number;
  /** Capital currently deployed in open positions. */
  deployedCapitalUsd: number;
  /** Capital available for new allocations. */
  availableCapitalUsd: number;
  /** Unrealised PnL across all positions. */
  unrealizedPnlUsd: number;
  /** Realised PnL (closed positions). */
  realizedPnlUsd: number;
  /** Cumulative funding collected. */
  fundingCollectedUsd: number;
  /** Current utilisation percentage (0–100). */
  utilizationPercent: number;
  /** Timestamp (ms) when this state was calculated. */
  updatedAt: number;
};

// ─── Capital Decision ──────────────────────────────────

export type CapitalDecision = {
  /** Opportunity identifier. */
  opportunityId: string;
  /** Trading pair symbol. */
  symbol: string;
  /** Whether the allocation was approved. */
  approved: boolean;
  /** Allocated USD amount (0 if rejected). */
  allocatedUsd: number;
  /** Human-readable reason. */
  reason: string;
  /** Projected utilisation after this allocation. */
  projectedUtilizationPercent: number;
};

// ─── Report ─────────────────────────────────────────────

export type CapitalManagerReport = {
  /** Current capital state snapshot. */
  capitalState: CapitalState;
  /** Per-opportunity capital decisions. */
  decisions: CapitalDecision[];
  /** Count of approved allocations. */
  approvedCount: number;
  /** Count of rejected allocations. */
  rejectedCount: number;
  /** Timestamp (ms) when the report was generated. */
  generatedAt: number;
};
