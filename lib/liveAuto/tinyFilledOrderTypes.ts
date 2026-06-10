/**
 * Tiny Filled Order Types — Mainnet Tiny Filled-Order Validation
 *
 * Defines the report and config types for the first real filled trade
 * on Binance Mainnet (LIMIT GTC, entry → fill → exit → fill → zero).
 */

// ─── Config ─────────────────────────────────────────────

export type TinyFilledOrderConfig = {
  maxCapitalUsd: number;
  maxPositionUsd: number;
  maxOpenPositions: number;
};

export const DEFAULT_TINY_FILLED_ORDER_CONFIG: TinyFilledOrderConfig = {
  maxCapitalUsd: 100,
  maxPositionUsd: 50,
  maxOpenPositions: 1,
};

// ─── Order Plan ─────────────────────────────────────────

export type TinyOrderPlan = {
  symbol: string;
  side: "buy" | "sell";
  type: "limit";
  timeInForce: "GTC";
  quantity: number;
  price: number;
  notional: number;
  tickSize: number;
  stepSize: number;
  minNotional: number;
};

// ─── Report ─────────────────────────────────────────────

export type TinyFilledOrderReport = {
  /** Whether the validation actually ran (vs skipped). */
  didRun: boolean;
  /** Trading symbol used. */
  symbol: string;
  /** Order quantity in base asset. */
  quantity: number;
  /** Total notional in USD. */
  notionalUsd: number;
  /** Exchange-assigned entry order ID. */
  entryOrderId?: string;
  /** Exchange-assigned exit order ID. */
  exitOrderId?: string;
  /** Entry order filled price (0 if not filled). */
  entryFilledPrice: number;
  /** Exit order filled price (0 if not filled). */
  exitFilledPrice: number;
  /** Realized PnL in USD. */
  realizedPnl: number;
  /** Funding collected in USD. */
  fundingCollected: number;
  /** Position open duration in ms. */
  positionOpenDurationMs: number;
  /** Remaining open orders after lifecycle. */
  remainingOpenOrders: number;
  /** Remaining positions after lifecycle. */
  remainingPositions: number;
  /** Total real orders executed. */
  realOrdersExecuted: number;
  /** Whether any MARKET order was used. */
  marketOrdersUsed: boolean;
  /** Whether max capital was breached. */
  maxCapitalBreached: boolean;
  /** Error reasons if the lifecycle failed. */
  errors: string[];
  /** Timestamp when the report was generated. */
  generatedAt: number;
};
