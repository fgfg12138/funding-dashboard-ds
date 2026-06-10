/**
 * In-Flight Order — Multi-Exchange Connector Spec
 *
 * Tracks an order throughout its lifecycle from creation to final state.
 * Pure functions with idempotent updates — no external dependencies.
 */

// ─── Status ────────────────────────────────────────────

export type InFlightOrderStatus =
  | "pending_create"
  | "open"
  | "partially_filled"
  | "filled"
  | "pending_cancel"
  | "cancelled"
  | "rejected"
  | "failed";

// ─── Type ─────────────────────────────────────────────

export type InFlightOrder = {
  /** Client-assigned order ID. */
  clientOrderId: string;
  /** Exchange-assigned order ID (undefined until acknowledged). */
  exchangeOrderId?: string;
  /** Exchange identifier. */
  exchangeId: string;
  /** Canonical symbol (e.g. "BTCUSDT"). */
  canonicalSymbol: string;
  /** Exchange-specific symbol. */
  exchangeSymbol: string;
  /** Order side. */
  side: "buy" | "sell";
  /** Order type. */
  type: "market" | "limit";
  /** Limit price (undefined for market orders). */
  price?: number;
  /** Total order quantity. */
  quantity: number;
  /** Quantity that has been filled. */
  executedQuantity: number;
  /** Cumulative fee paid in USD. */
  cumulativeFeeUsd: number;
  /** Current order status. */
  status: InFlightOrderStatus;
  /** Timestamp (ms) when the order was created. */
  createdAt: number;
  /** Timestamp (ms) when the order was last updated. */
  updatedAt: number;
};

// ─── Order Update / Trade Update Types ─────────────────

export type ConnectorOrderUpdate = {
  /** Exchange order ID. */
  exchangeOrderId: string;
  /** New status. */
  newStatus: InFlightOrderStatus;
  /** Optional misc updates (e.g. price change). */
  misc?: Record<string, unknown>;
  /** Update timestamp (ms). */
  timestamp: number;
};

export type ConnectorTradeUpdate = {
  /** Exchange-assigned trade ID (for dedup). */
  tradeId: string;
  /** Exchange order ID. */
  exchangeOrderId: string;
  /** Fill price. */
  fillPrice: number;
  /** Fill quantity in base asset. */
  fillQuantity: number;
  /** Fee paid in USD. */
  feeUsd: number;
  /** Fill timestamp (ms). */
  timestamp: number;
};

// ─── LEGAL STATUS TRANSITIONS ──────────────────────────

const LEGAL_TRANSITIONS: Record<InFlightOrderStatus, InFlightOrderStatus[]> = {
  pending_create: ["open", "rejected", "failed"],
  open: ["partially_filled", "filled", "pending_cancel", "cancelled", "rejected", "failed"],
  partially_filled: ["partially_filled", "filled", "pending_cancel", "cancelled"],
  filled: [],
  pending_cancel: ["cancelled", "failed"],
  cancelled: [],
  rejected: [],
  failed: [],
};

function isValidTransition(from: InFlightOrderStatus, to: InFlightOrderStatus): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Functions ─────────────────────────────────────────

export function createInFlightOrder(params: {
  clientOrderId: string;
  exchangeId: string;
  canonicalSymbol: string;
  exchangeSymbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  quantity: number;
  price?: number;
}): InFlightOrder {
  const now = Date.now();
  return {
    clientOrderId: params.clientOrderId,
    exchangeId: params.exchangeId,
    canonicalSymbol: params.canonicalSymbol,
    exchangeSymbol: params.exchangeSymbol,
    side: params.side,
    type: params.type,
    price: params.price,
    quantity: params.quantity,
    executedQuantity: 0,
    cumulativeFeeUsd: 0,
    status: "pending_create",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Apply an order update to an in-flight order.
 * Returns a new object (immutable). Idempotent: same exchangeOrderId is safe.
 */
export function updateWithOrderUpdate(
  order: InFlightOrder,
  update: ConnectorOrderUpdate,
): InFlightOrder {
  const newStatus = update.newStatus;

  // Allow same-status updates (e.g., open → open) and legal transitions
  const transitionOk = newStatus === order.status || isValidTransition(order.status, newStatus);

  // Idempotent: if exchangeOrderId already matches, still allow status progression
  const updated = {
    ...order,
    exchangeOrderId: order.exchangeOrderId ?? update.exchangeOrderId,
    status: transitionOk ? newStatus : order.status,
    updatedAt: Math.max(order.updatedAt, update.timestamp),
  };

  // If misc price update is provided
  if (update.misc?.price !== undefined && typeof update.misc.price === "number") {
    updated.price = update.misc.price;
  }

  return updated;
}

/**
 * Apply a trade update to an in-flight order.
 * Idempotent: duplicate tradeId is ignored.
 * Returns a new object (immutable).
 */
export function updateWithTradeUpdate(
  order: InFlightOrder,
  update: ConnectorTradeUpdate,
  processedTradeIds: Set<string>,
): { order: InFlightOrder; isNew: boolean } {
  // Idempotent: skip if already processed
  if (processedTradeIds.has(update.tradeId)) {
    return { order, isNew: false };
  }

  const newExecuted = order.executedQuantity + update.fillQuantity;
  const clampedExecuted = Math.min(newExecuted, order.quantity);

  const newStatus: InFlightOrderStatus =
    clampedExecuted >= order.quantity ? "filled"
    : order.status === "open" || order.status === "pending_create" ? "partially_filled"
    : order.status;

  const updated: InFlightOrder = {
    ...order,
    executedQuantity: clampedExecuted,
    cumulativeFeeUsd: order.cumulativeFeeUsd + update.feeUsd,
    status: newStatus,
    exchangeOrderId: order.exchangeOrderId ?? update.exchangeOrderId,
    updatedAt: Math.max(order.updatedAt, update.timestamp),
  };

  return { order: updated, isNew: true };
}

// ─── JSON Serialization ───────────────────────────────

export function toJSONInFlightOrder(order: InFlightOrder): Record<string, unknown> {
  return { ...order };
}

export function fromJSONInFlightOrder(json: Record<string, unknown>): InFlightOrder {
  return {
    clientOrderId: String(json.clientOrderId),
    exchangeOrderId: json.exchangeOrderId !== undefined ? String(json.exchangeOrderId) : undefined,
    exchangeId: String(json.exchangeId),
    canonicalSymbol: String(json.canonicalSymbol),
    exchangeSymbol: String(json.exchangeSymbol),
    side: String(json.side) as "buy" | "sell",
    type: String(json.type) as "market" | "limit",
    price: json.price !== undefined ? Number(json.price) : undefined,
    quantity: Number(json.quantity),
    executedQuantity: Number(json.executedQuantity),
    cumulativeFeeUsd: Number(json.cumulativeFeeUsd),
    status: String(json.status) as InFlightOrderStatus,
    createdAt: Number(json.createdAt),
    updatedAt: Number(json.updatedAt),
  };
}
