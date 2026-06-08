/**
 * Account Sync Types — Beta Phase 2
 *
 * Defines unified data structures for reading exchange account
 * information (balances, positions, orders) via read-only API keys.
 *
 * Pure types — no logic.
 */

import type { SupportedExchange } from "../security/apiKeyTypes";

// ─── Balance ─────────────────────────────────────────────

export type AccountBalance = {
  /** Exchange this balance belongs to. */
  exchange: SupportedExchange;
  /** Asset symbol (e.g. "USDT", "BTC"). */
  asset: string;
  /** Total balance (available + locked). */
  total: number;
  /** Available (free) balance. */
  available: number;
  /** Locked / in-order balance. */
  locked: number;
  /** Timestamp (ms) when this balance was fetched. */
  updatedAt: number;
};

// ─── Position ────────────────────────────────────────────

export type AccountPosition = {
  /** Exchange this position belongs to. */
  exchange: SupportedExchange;
  /** Trading pair symbol (e.g. "BTCUSDT"). */
  symbol: string;
  /** Position direction. */
  side: "long" | "short";
  /** Quantity in base asset units. */
  quantity: number;
  /** Average entry price. */
  entryPrice: number;
  /** Current mark price (if available). */
  markPrice?: number;
  /** Unrealised PnL in USD (if available). */
  unrealizedPnl?: number;
  /** Leverage (e.g. 1 for spot, 5 for 5x perpetual). */
  leverage?: number;
  /** Margin mode ("isolated" or "cross"). */
  marginMode?: string;
  /** Timestamp (ms) when this position was fetched. */
  updatedAt: number;
};

// ─── Order ───────────────────────────────────────────────

export type AccountOrder = {
  /** Exchange this order belongs to. */
  exchange: SupportedExchange;
  /** Exchange-assigned order ID. */
  orderId: string;
  /** Trading pair symbol. */
  symbol: string;
  /** Order side. */
  side: "buy" | "sell";
  /** Order type (e.g. "limit", "market"). */
  type: string;
  /** Order status (e.g. "new", "filled", "canceled"). */
  status: string;
  /** Quantity in base asset units. */
  quantity: number;
  /** Order price (undefined for market orders). */
  price?: number;
  /** Timestamp (ms) when the order was created. */
  createdAt: number;
  /** Timestamp (ms) when the order was last updated. */
  updatedAt: number;
};

// ─── Snapshot ────────────────────────────────────────────

export type AccountSnapshot = {
  /** All balances across all synced exchanges. */
  balances: AccountBalance[];
  /** All positions across all synced exchanges. */
  positions: AccountPosition[];
  /** All open/recent orders across all synced exchanges. */
  orders: AccountOrder[];
  /** Timestamp (ms) when this snapshot was taken. */
  syncedAt: number;
};

// ─── Sync Result (per exchange) ──────────────────────────

export type SyncResult = {
  /** Exchange that was synced. */
  exchange: SupportedExchange;
  /** Whether the sync succeeded. */
  success: boolean;
  /** The account snapshot (undefined if sync failed). */
  snapshot?: AccountSnapshot;
  /** Error messages (empty on success). */
  errors: string[];
};
