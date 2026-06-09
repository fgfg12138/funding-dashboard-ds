/**
 * Exit Suggestion Types — Semi Phase 4
 *
 * Defines data structures for generating exit suggestions based on
 * funding decline, delta, risk, reconciliation, holding time, PnL targets.
 *
 * Pure types — no logic.
 */

// ─── Status ──────────────────────────────────────────────

export type ExitSuggestionStatus = "hold" | "suggest_exit" | "urgent_exit";

// ─── Reasons ─────────────────────────────────────────────

export type ExitReason =
  | "funding_declined"
  | "delta_too_high"
  | "risk_too_high"
  | "reconciliation_issue"
  | "max_holding_time_exceeded"
  | "pnl_target_reached"
  | "stop_loss_triggered";

// ─── Severity ────────────────────────────────────────────

export type ExitSuggestionSeverity = "low" | "medium" | "high";

// ─── Per-Position Suggestion ─────────────────────────────

export type PositionExitSuggestion = {
  /** Position identifier. */
  positionId: string;
  /** Trading pair symbol. */
  symbol: string;
  /** Overall suggestion status. */
  status: ExitSuggestionStatus;
  /** All triggered exit reasons. */
  reasons: ExitReason[];
  /** Aggregated severity. */
  severity: ExitSuggestionSeverity;
  /** Human-readable message. */
  message: string;
  /** Total PnL at time of suggestion. */
  totalPnlUsd: number;
  /** Funding collected at time of suggestion. */
  fundingCollectedUsd: number;
  /** Timestamp (ms) when the suggestion was generated. */
  generatedAt: number;
};

// ─── Report ──────────────────────────────────────────────

export type ExitSuggestionReport = {
  /** Per-position suggestions. */
  suggestions: PositionExitSuggestion[];
  /** Count of positions with status hold. */
  holdCount: number;
  /** Count of positions with status suggest_exit. */
  suggestExitCount: number;
  /** Count of positions with status urgent_exit. */
  urgentExitCount: number;
  /** Timestamp (ms) when the report was generated. */
  generatedAt: number;
};

// ─── Config ──────────────────────────────────────────────

export type ExitSuggestionConfig = {
  /**
   * Minimum acceptable net APY percent (default 10).
   * If currentNetApy < this → funding_declined.
   */
  minNetApyPercent?: number;

  /**
   * Maximum absolute delta percent (default 3).
   * If |deltaPercent| > this → delta_too_high.
   */
  maxDeltaPercent?: number;

  /**
   * Maximum holding time in hours (default 48).
   * If holdingHours > this → max_holding_time_exceeded.
   */
  maxHoldingHours?: number;

  /**
   * Take-profit threshold in USD (default 500).
   * If totalPnlUsd >= this → pnl_target_reached.
   */
  takeProfitUsd?: number;

  /**
   * Stop-loss threshold in USD (default 500).
   * If totalPnlUsd <= -abs(this) → stop_loss_triggered.
   */
  stopLossUsd?: number;

  /**
   * Risk levels that make exit urgent (default ["critical"]).
   */
  urgentRiskLevels?: string[];

  /**
   * Risk levels that make exit suggested (default ["high", "medium"]).
   */
  warningRiskLevels?: string[];
};
