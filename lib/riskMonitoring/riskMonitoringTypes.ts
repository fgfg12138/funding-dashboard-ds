/**
 * Risk Monitoring Types — Beta Phase 5
 *
 * Defines data structures for monitoring leverage, margin,
 * liquidation distance, delta, position size, and reconciliation risks.
 *
 * Pure types — no logic.
 */

// ─── Severity ────────────────────────────────────────────

export type RiskSeverity = "low" | "medium" | "high" | "critical";

// ─── Category ────────────────────────────────────────────

export type RiskCategory =
  | "leverage"
  | "margin"
  | "liquidation"
  | "delta"
  | "position"
  | "reconciliation";

// ─── Individual Risk Event ──────────────────────────────

export type RiskEvent = {
  /** Unique event identifier. */
  id: string;
  /** Risk category. */
  category: RiskCategory;
  /** Severity level. */
  severity: RiskSeverity;
  /** Exchange this event relates to (optional). */
  exchange?: string;
  /** Trading pair symbol (optional). */
  symbol?: string;
  /** Local position ID (optional). */
  positionId?: string;
  /** Short human-readable title. */
  title: string;
  /** Detailed description. */
  message: string;
  /** The current value that triggered the event. */
  value?: number;
  /** The threshold that was exceeded. */
  threshold?: number;
  /** Timestamp (ms) when the event was generated. */
  createdAt: number;
};

// ─── Config ──────────────────────────────────────────────

export type RiskMonitoringConfig = {
  /**
   * Maximum allowed leverage (default 5).
   */
  maxLeverage?: number;

  /**
   * Minimum margin ratio as a percentage (default 20).
   */
  minMarginRatioPercent?: number;

  /**
   * Minimum liquidation distance as a percentage (default 10).
   */
  minLiquidationDistancePercent?: number;

  /**
   * Maximum absolute delta percent (default 3).
   */
  maxDeltaPercent?: number;

  /**
   * Maximum position notional in USD (default 50,000).
   */
  maxPositionNotionalUsd?: number;

  /**
   * Whether to allow open reconciliation issues without raising risk events.
   * Default false (reconciliation issues always generate events).
   */
  allowOpenReconciliationIssues?: boolean;
};

// ─── Report ──────────────────────────────────────────────

export type RiskReport = {
  /** All generated risk events. */
  events: RiskEvent[];
  /** Count of low-severity events. */
  lowCount: number;
  /** Count of medium-severity events. */
  mediumCount: number;
  /** Count of high-severity events. */
  highCount: number;
  /** Count of critical-severity events. */
  criticalCount: number;
  /** Overall portfolio risk level. */
  overallRisk: RiskSeverity;
  /** Timestamp (ms) when the report was generated. */
  generatedAt: number;
};
