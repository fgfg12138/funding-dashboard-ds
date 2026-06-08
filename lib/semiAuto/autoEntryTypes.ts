/**
 * Auto Entry Types — Semi Phase 2
 *
 * Defines data structures for planning and executing spot + perpetual
 * entry orders after user confirmation.
 *
 * Pure types — no logic.
 */

// ─── User Confirmation ──────────────────────────────────

export type UserConfirmation = {
  /** The recommendation the user is confirming. */
  recommendationId: string;
  /** Whether the user confirmed (true) or rejected. */
  confirmed: boolean;
  /** Timestamp (ms) when the user confirmed. */
  confirmedAt: number;
  /** Optional user identifier. */
  userId?: string;
};

// ─── Leg Plan ────────────────────────────────────────────

export type EntryLegPlan = {
  /** Target exchange. */
  exchange: string;
  /** Trading pair symbol. */
  symbol: string;
  /** Instrument type. */
  marketType: "spot" | "perpetual";
  /** Order side. */
  side: "buy" | "sell";
  /** Quantity in base asset units. */
  quantity: number;
  /** Estimated execution price. */
  estimatedPrice: number;
  /** Notional value in USD. */
  notionalUsd: number;
};

// ─── Execution Plan ─────────────────────────────────────

export type EntryExecutionPlan = {
  /** Source recommendation ID. */
  recommendationId: string;
  /** Trading pair symbol. */
  symbol: string;
  /** Spot leg plan. */
  spotLeg: EntryLegPlan;
  /** Perpetual leg plan. */
  perpetualLeg: EntryLegPlan;
  /** Total notional across both legs. */
  totalNotionalUsd: number;
  /** Expected net APY. */
  expectedNetApy: number;
  /** Risk level at planning time. */
  riskLevel: string;
  /** Timestamp (ms) when the plan was created. */
  createdAt: number;
};

// ─── Execution Result ───────────────────────────────────

export type EntryExecutionStatus = "blocked" | "planned" | "executed";

export type EntryExecutionResult = {
  /** Source recommendation ID. */
  recommendationId: string;
  /** Final status. */
  status: EntryExecutionStatus;
  /** Execution plan (undefined if blocked before planning). */
  plan?: EntryExecutionPlan;
  /** Error messages (empty on success). */
  errors: string[];
  /** Timestamp (ms) when execution completed or was blocked. */
  executedAt?: number;
};

// ─── Config ──────────────────────────────────────────────

export type ExecutionConfig = {
  /** Whether real exchange execution is permitted (default false). */
  allowRealExecution?: boolean;
  /** Whether user confirmation is required (default true). */
  requireUserConfirmation?: boolean;
  /** Maximum total notional in USD (default 50,000). */
  maxNotionalUsd?: number;
  /** List of allowed exchanges for execution. */
  allowedExchanges?: string[];
  /** If true, only plan; never call exchange APIs (default true). */
  dryRun?: boolean;
  /** Current mark price for computing quantity from allocated capital. */
  markPrice?: number;
};

// ─── Execution Adapter Interface ────────────────────────

export type EntryExecutionAdapter = {
  /** Exchange name this adapter targets. */
  readonly exchangeName: string;

  /**
   * Execute a spot leg order.
   * Returns the order ID on success.
   * Throws on failure.
   */
  executeSpotLeg(leg: EntryLegPlan): Promise<string>;

  /**
   * Execute a perpetual leg order.
   * Returns the order ID on success.
   * Throws on failure.
   */
  executePerpetualLeg(leg: EntryLegPlan): Promise<string>;
};

// ─── Mock Execution Adapter ─────────────────────────────

export class MockExecutionAdapter implements EntryExecutionAdapter {
  readonly exchangeName: string;

  constructor(exchangeName: string) {
    this.exchangeName = exchangeName;
  }

  async executeSpotLeg(leg: EntryLegPlan): Promise<string> {
    return `mock-spot-${leg.symbol}-${Date.now()}`;
  }

  async executePerpetualLeg(leg: EntryLegPlan): Promise<string> {
    return `mock-perp-${leg.symbol}-${Date.now()}`;
  }
}
