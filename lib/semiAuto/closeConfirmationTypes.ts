/**
 * Close Confirmation Types — Semi Phase 5
 *
 * Defines data structures for user-confirmed position close execution.
 *
 * Pure types — no logic.
 */

// ─── User Close Confirmation ────────────────────────────

export type UserCloseConfirmation = {
  /** Position identifier to close. */
  positionId: string;
  /** Whether the user confirmed the close (true) or rejected. */
  confirmed: boolean;
  /** Timestamp (ms) when the user confirmed. */
  confirmedAt: number;
  /** Optional user identifier. */
  userId?: string;
};

// ─── Close Leg Plan ─────────────────────────────────────

export type CloseLegPlan = {
  /** Target exchange. */
  exchange: string;
  /** Trading pair symbol. */
  symbol: string;
  /** Instrument type. */
  marketType: "spot" | "perpetual";
  /** Order side (opposite of the open leg). */
  side: "buy" | "sell";
  /** Quantity in base asset units. */
  quantity: number;
  /** Estimated close price. */
  estimatedPrice: number;
  /** Notional value in USD. */
  notionalUsd: number;
};

// ─── Close Execution Plan ───────────────────────────────

export type CloseExecutionPlan = {
  /** Position identifier to close. */
  positionId: string;
  /** Trading pair symbol. */
  symbol: string;
  /** Spot leg close plan. */
  spotLegClose: CloseLegPlan;
  /** Perpetual leg close plan. */
  perpetualLegClose: CloseLegPlan;
  /** Total notional closing value. */
  totalNotionalUsd: number;
  /** Reason for closing. */
  reason: string;
  /** Timestamp (ms) when the plan was created. */
  createdAt: number;
};

// ─── Close Execution Result ─────────────────────────────

export type CloseExecutionStatus = "blocked" | "planned" | "executed";

export type CloseExecutionResult = {
  /** Position identifier. */
  positionId: string;
  /** Final status. */
  status: CloseExecutionStatus;
  /** Close execution plan (undefined if blocked before planning). */
  plan?: CloseExecutionPlan;
  /** Error messages (empty on success). */
  errors: string[];
  /** Timestamp (ms) when execution completed or was blocked. */
  executedAt?: number;
};

// ─── Config ──────────────────────────────────────────────

export type CloseExecutionConfig = {
  /** Whether user confirmation is required (default true). */
  requireUserConfirmation?: boolean;
  /** Whether real exchange execution is permitted (default false). */
  allowRealExecution?: boolean;
  /** If true, only plan; never call exchange APIs (default true). */
  dryRun?: boolean;
  /** List of allowed exchanges for execution. */
  allowedExchanges?: string[];
  /** Maximum total close notional in USD (default 100,000). */
  maxCloseNotionalUsd?: number;
  /** Mark price for computing notional (if legs already have it). */
  markPrice?: number;
};

// ─── Close Execution Adapter Interface ──────────────────

export type CloseExecutionAdapter = {
  /** Exchange name this adapter targets. */
  readonly exchangeName: string;

  /**
   * Execute a spot close order.
   * Returns the order ID on success. Throws on failure.
   */
  executeSpotClose(leg: CloseLegPlan): Promise<string>;

  /**
   * Execute a perpetual close order.
   * Returns the order ID on success. Throws on failure.
   */
  executePerpetualClose(leg: CloseLegPlan): Promise<string>;
};

// ─── Mock Close Execution Adapter ───────────────────────

export class MockCloseExecutionAdapter implements CloseExecutionAdapter {
  readonly exchangeName: string;

  constructor(exchangeName: string) {
    this.exchangeName = exchangeName;
  }

  async executeSpotClose(_leg: CloseLegPlan): Promise<string> {
    return `mock-close-spot-${Date.now()}`;
  }

  async executePerpetualClose(_leg: CloseLegPlan): Promise<string> {
    return `mock-close-perp-${Date.now()}`;
  }
}
