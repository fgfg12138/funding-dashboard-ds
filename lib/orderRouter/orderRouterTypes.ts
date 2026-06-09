/**
 * Order Router Types — Live Phase 1
 *
 * Defines unified order data structures that normalise Binance, Bybit,
 * and OKX order semantics into a single format.
 *
 * Pure types — no logic.
 */

// ─── Basic enums ─────────────────────────────────────────

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderStatus = "pending" | "open" | "filled" | "cancelled" | "rejected";
export type ExchangeName = "binance" | "bybit" | "okx";

// ─── Unified Order Request ──────────────────────────────

export type UnifiedOrderRequest = {
  /** Target exchange. */
  exchange: ExchangeName;
  /** Trading pair symbol (e.g. "BTCUSDT"). */
  symbol: string;
  /** Order side. */
  side: OrderSide;
  /** Order type. */
  type: OrderType;
  /** Quantity in base asset units. */
  quantity: number;
  /** Limit price (required for limit orders). */
  price?: number;
  /** Client-assigned order ID for reconciliation. */
  clientOrderId?: string;
};

// ─── Unified Order ──────────────────────────────────────

export type UnifiedOrder = {
  /** Exchange this order was submitted to. */
  exchange: ExchangeName;
  /** Exchange-assigned order ID. */
  orderId: string;
  /** Client-assigned order ID (if provided). */
  clientOrderId?: string;
  /** Trading pair symbol. */
  symbol: string;
  /** Order side. */
  side: OrderSide;
  /** Order type. */
  type: OrderType;
  /** Total order quantity. */
  quantity: number;
  /** Quantity already filled. */
  filledQuantity: number;
  /** Limit price (undefined for market orders). */
  price?: number;
  /** Current order status. */
  status: OrderStatus;
  /** Timestamp (ms) when the order was created. */
  createdAt: number;
  /** Timestamp (ms) when the order was last updated. */
  updatedAt: number;
};

// ─── Execution Result ───────────────────────────────────

export type OrderExecutionResult = {
  /** Whether the operation succeeded. */
  success: boolean;
  /** The resulting order (undefined on failure). */
  order?: UnifiedOrder;
  /** Error messages (empty on success). */
  errors: string[];
};
