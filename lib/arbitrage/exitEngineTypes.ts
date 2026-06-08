/**
 * Exit Engine Types — Alpha Phase A5
 *
 * Defines exit rules, decisions, and context for evaluating
 * whether a funding arbitrage position should be closed.
 *
 * Pure types — no logic.
 */

import type { ArbitragePosition } from "./arbitragePositionTypes";

// ─── Exit Reason ─────────────────────────────────────────

export type ExitReason =
  | "funding_declined"
  | "net_apy_too_low"
  | "risk_increased"
  | "max_holding_time_exceeded"
  | "take_profit_reached"
  | "stop_loss_reached"
  | "delta_too_high";

// ─── Severity ────────────────────────────────────────────

export type ExitSeverity = "low" | "medium" | "high";

// ─── Exit Decision ───────────────────────────────────────

export type ExitDecisionMetrics = {
  /** Total PnL in USD at time of check. */
  totalPnlUsd: number;

  /** Cumulative funding collected in USD. */
  fundingCollectedUsd: number;

  /** Absolute delta percent rounded to 2 decimals. */
  deltaPercent: number;

  /** Current net APY (if available). */
  currentNetApy?: number;

  /** Current funding rate (if available). */
  currentFundingRate?: number;

  /** How many hours the position has been held. */
  holdingHours: number;
};

export type ExitDecision = {
  /** Whether the engine recommends exiting. */
  shouldExit: boolean;

  /** All triggered exit reasons (empty array = hold). */
  reasons: ExitReason[];

  /** Aggregated severity from triggered reasons. */
  severity: ExitSeverity;

  /** Human-readable summary. */
  message: string;

  /** Timestamp (ms) when the check was performed. */
  checkedAt: number;

  /** Snapshot of key metrics at check time. */
  metrics: ExitDecisionMetrics;
};

// ─── Config ──────────────────────────────────────────────

export type ExitEngineConfig = {
  /**
   * Minimum acceptable expected net APY percent.
   * If currentNetApy < this, net_apy_too_low is triggered.
   * Default 10.
   */
  minNetApyPercent?: number;

  /**
   * Maximum acceptable absolute delta percent.
   * If |deltaPercent| > this, delta_too_high is triggered.
   * Default 3.
   */
  maxDeltaPercent?: number;

  /**
   * Maximum holding time in hours.
   * If holdingTime >= this, max_holding_time_exceeded is triggered.
   * Default 48.
   */
  maxHoldingHours?: number;

  /**
   * Take-profit threshold in USD.
   * If totalPnlUsd >= this, take_profit_reached is triggered.
   * Optional — not set means no take-profit rule.
   */
  takeProfitUsd?: number;

  /**
   * Stop-loss threshold in USD (positive scalar).
   * If totalPnlUsd <= -this, stop_loss_reached is triggered.
   * Optional — not set means no stop-loss rule.
   */
  stopLossUsd?: number;

  /**
   * Minimum acceptable single-period funding rate (decimal).
   * If currentFundingRate < this, funding_declined is triggered.
   * Optional — use entryFundingRate comparison for decline detection instead.
   */
  minFundingRate?: number;

  /**
   * Threshold percent for detecting funding decline.
   * declinePercent = (entryRate - currentRate) / |entryRate| * 100
   * If declinePercent >= this, funding_declined is triggered.
   * Default 50.
   */
  fundingDeclineThresholdPercent?: number;
};

// ─── Market Context ─────────────────────────────────────

export type ExitMarketContext = {
  /** Current time in ms (default Date.now()). */
  currentTime: number;

  /** Current single-period funding rate (decimal). */
  currentFundingRate?: number;

  /** Entry (historical) single-period funding rate (decimal). */
  entryFundingRate?: number;

  /** Current expected net APY (from Alpha-2). */
  currentNetApy?: number;

  /** Current risk score (0-100, higher = riskier). */
  riskScore?: number;

  /** Current liquidity score (0-100). */
  liquidityScore?: number;

  /** Current volatility score (0-100). */
  volatilityScore?: number;
};
