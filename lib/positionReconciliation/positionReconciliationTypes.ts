/**
 * Position Reconciliation Types — Beta Phase 4
 *
 * Defines data structures for comparing exchange positions
 * against local arbitrage positions and reporting discrepancies.
 *
 * Pure types — no logic.
 */

import type { SupportedExchange } from "../security/apiKeyTypes";

// ─── Reconciliation Status ───────────────────────────────

export type ReconciliationStatus =
  | "matched"
  | "missing_on_exchange"
  | "missing_locally"
  | "quantity_mismatch"
  | "side_mismatch"
  | "price_mismatch"
  | "delta_mismatch";

// ─── Severity ────────────────────────────────────────────

export type ReconciliationSeverity = "low" | "medium" | "high";

// ─── Individual Reconciliation Item ──────────────────────

export type PositionReconciliationItem = {
  /** Trading pair symbol (e.g. "BTCUSDT"). */
  symbol: string;
  /** Exchange this item relates to. */
  exchange: SupportedExchange;
  /** Local position ID (if matched locally). */
  localPositionId?: string;
  /** Exchange position identifier (if matched on exchange). */
  exchangePositionId?: string;
  /** Overall reconciliation status for this position pair. */
  status: ReconciliationStatus;
  /** Aggregated severity. */
  severity: ReconciliationSeverity;
  /** Human-readable description. */
  message: string;
  /** Local position quantity (if applicable). */
  localQuantity?: number;
  /** Exchange position quantity (if applicable). */
  exchangeQuantity?: number;
  /** Local position side (if applicable). */
  localSide?: "long" | "short" | string;
  /** Exchange position side (if applicable). */
  exchangeSide?: "long" | "short" | string;
  /** Local entry price (if applicable). */
  localEntryPrice?: number;
  /** Exchange entry price (if applicable). */
  exchangeEntryPrice?: number;
  /** Local delta in USD (if applicable). */
  localDeltaUsd?: number;
  /** Exchange delta in USD (if applicable). */
  exchangeDeltaUsd?: number;
  /** Human-readable diff description. */
  diff: string;
};

// ─── Config ──────────────────────────────────────────────

export type PositionReconciliationConfig = {
  /**
   * Allowed quantity difference as a percentage (e.g. 0.5 = 0.5 %).
   * Default 0.5.
   */
  quantityTolerancePercent?: number;

  /**
   * Allowed entry price difference as a percentage (e.g. 1 = 1 %).
   * Default 1.
   */
  priceTolerancePercent?: number;

  /**
   * Allowed delta difference in USD (e.g. 100).
   * Default 100.
   */
  deltaToleranceUsd?: number;
};

// ─── Report ─────────────────────────────────────────────

export type PositionReconciliationReport = {
  /** All reconciliation items. */
  items: PositionReconciliationItem[];
  /** Number of items with status "matched". */
  matchedCount: number;
  /** Number of items with a mismatch status. */
  mismatchCount: number;
  /** Number of items with high severity. */
  highSeverityCount: number;
  /** Timestamp (ms) when the report was generated. */
  generatedAt: number;
};
