/**
 * Hedge Engine Types — Live Phase 2
 *
 * Defines data structures for building and executing delta-neutral
 * hedge plans (spot-perp or perp-perp spread).
 *
 * Pure types — no logic.
 */

// ─── Basic enums ─────────────────────────────────────────

export type HedgeLegType = "spot" | "perpetual";
export type HedgeSide = "long" | "short";
export type HedgePlanStatus = "planned" | "executed" | "failed" | "partial";

// ─── Single Leg Plan ────────────────────────────────────

export type HedgeLegPlan = {
  /** Target exchange for this leg. */
  exchange: string;
  /** Trading pair symbol. */
  symbol: string;
  /** Instrument type. */
  legType: HedgeLegType;
  /** Direction. */
  side: HedgeSide;
  /** Quantity in base asset units. */
  quantity: number;
  /** Estimated execution price. */
  price: number;
  /** Notional value in USD. */
  notionalUsd: number;
};

// ─── Hedge Plan ─────────────────────────────────────────

export type HedgePlan = {
  /** Unique plan identifier. */
  id: string;
  /** Trading pair symbol. */
  symbol: string;
  /** All legs in this hedge plan. */
  legs: HedgeLegPlan[];
  /** Target delta USD (usually 0). */
  targetDeltaUsd: number;
  /** Expected delta USD after execution. */
  expectedDeltaUsd: number;
  /** Expected delta as a percentage of max leg notional. */
  expectedDeltaPercent: number;
  /** Current plan status. */
  status: HedgePlanStatus;
  /** Timestamp (ms) when the plan was created. */
  createdAt: number;
};

// ─── Execution Result ───────────────────────────────────

export type HedgeExecutionResult = {
  /** Plan ID that was executed. */
  planId: string;
  /** Final execution status. */
  status: HedgePlanStatus;
  /** Orders created during execution (empty if dryRun). */
  orders: Array<{ exchange: string; orderId: string; symbol: string; side: string; quantity: number }>;
  /** Error messages (empty on full success). */
  errors: string[];
  /** Timestamp (ms) when execution completed. */
  executedAt?: number;
};

// ─── Config ──────────────────────────────────────────────

export type HedgeEngineConfig = {
  /**
   * Maximum absolute delta percent before validation fails (default 0.5).
   */
  maxDeltaPercent?: number;

  /**
   * Maximum total notional in USD (default 100,000).
   */
  maxNotionalUsd?: number;

  /**
   * Whether to continue executing remaining legs if one fails (default false).
   */
  allowPartialExecution?: boolean;

  /**
   * If true, only plan; never call Order Router (default true).
   */
  dryRun?: boolean;
};
