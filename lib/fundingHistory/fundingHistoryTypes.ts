/**
 * Funding History Types — Beta Phase 3
 *
 * Defines data structures for reading and unifying exchange
 * funding rate payment history.
 *
 * Pure types — no logic.
 */

import type { SupportedExchange } from "../security/apiKeyTypes";

// ─── Single funding payment entry ────────────────────────

export type FundingHistoryEntry = {
  /** Exchange this entry came from. */
  exchange: SupportedExchange;
  /** Trading pair symbol (e.g. "BTCUSDT"). */
  symbol: string;
  /** Single-period funding rate (decimal, e.g. 0.0001). */
  fundingRate: number;
  /** Funding payment amount in USD (positive = received, negative = paid). */
  fundingAmountUsd: number;
  /** Position side at time of settlement. */
  positionSide: "long" | "short";
  /** Notional value the funding was applied to. */
  notionalUsd?: number;
  /** Settlement timestamp (ms). */
  settledAt: number;
  /** Exchange transaction / settlement ID (if available). */
  transactionId?: string;
  /** Raw data from the exchange (for debugging). */
  raw?: Record<string, unknown>;
};

// ─── Snapshot ────────────────────────────────────────────

export type FundingHistorySnapshot = {
  /** Funding history entries. */
  entries: FundingHistoryEntry[];
  /** Timestamp (ms) when this snapshot was taken. */
  syncedAt: number;
  /** Exchange this snapshot came from (undefined if merged). */
  exchange?: SupportedExchange;
};

// ─── Sync Result ─────────────────────────────────────────

export type FundingHistorySyncResult = {
  /** Exchange that was synced. */
  exchange: SupportedExchange;
  /** Whether the sync succeeded. */
  success: boolean;
  /** The funding history snapshot (undefined on failure). */
  snapshot?: FundingHistorySnapshot;
  /** Error messages (empty on success). */
  errors: string[];
};

// ─── Query ───────────────────────────────────────────────

export type FundingHistoryQuery = {
  /** Filter by exchange. */
  exchange?: SupportedExchange;
  /** Filter by symbol (e.g. "BTCUSDT"). */
  symbol?: string;
  /** Filter by start time (ms, inclusive). */
  startTime?: number;
  /** Filter by end time (ms, inclusive). */
  endTime?: number;
  /** Maximum number of entries to return. */
  limit?: number;
};
