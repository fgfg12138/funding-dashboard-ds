/**
 * Funding Accrual Types — Alpha Phase A4
 *
 * Data models for simulating per-period funding settlement
 * on an existing arbitrage position.
 *
 * Pure types — no logic.
 */

import type { ArbitragePosition } from "./arbitragePositionTypes";

// ─── Accrual Event ───────────────────────────────────────

export type FundingAccrualEvent = {
  /** Unique event identifier. */
  id: string;

  /** The position this accrual belongs to. */
  positionId: string;

  /** Trading pair symbol (e.g. "BTC/USDT"). */
  symbol: string;

  /** Exchange where funding was settled. */
  exchange: string;

  /** The single-period funding rate used (decimal, e.g. 0.0001). */
  fundingRate: number;

  /** Funding interval in hours (normally 8). */
  fundingIntervalHours: number;

  /** Notional value the funding was applied to. */
  notionalUsd: number;

  /** Funding payment amount in USD (positive = received, negative = paid). */
  fundingAmountUsd: number;

  /** Timestamp (ms) when this settlement occurred. */
  settledAt: number;

  /** Which leg type this funding was settled on. */
  legType: "spot" | "perpetual";

  /** Side of the leg at time of settlement. */
  side: "long" | "short";
};

// ─── Accrual Input ───────────────────────────────────────

export type FundingAccrualInput = {
  /** The position to accrue funding on. */
  position: ArbitragePosition;

  /** Single-period funding rate (decimal, e.g. 0.0001 = 0.01 %). */
  fundingRate: number;

  /** Timestamp (ms) when this settlement occurs. Defaults to Date.now(). */
  settledAt?: number;

  /** Funding interval in hours (default 8). */
  fundingIntervalHours?: number;

  /** Which exchange to record on the event. Defaults to the leg's exchange. */
  exchange?: string;

  /**
   * Which leg type to apply funding to.
   * Default: "perpetual" (only perpetual legs settle funding).
   */
  legType?: "spot" | "perpetual";
};

// ─── Accrual Result ──────────────────────────────────────

export type FundingAccrualResult = {
  /** The event that was generated. */
  event: FundingAccrualEvent;

  /** A new position object with updated fundingCollectedUsd + totalPnlUsd. */
  updatedPosition: ArbitragePosition;
};
