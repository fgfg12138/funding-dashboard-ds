/**
 * Auto Monitoring Types — Semi Phase 3
 *
 * Defines data structures for continuously monitoring open arbitrage
 * positions across funding, delta, PnL, risk, and reconciliation dimensions.
 *
 * Pure types — no logic.
 */

// ─── Status ──────────────────────────────────────────────

export type MonitoringStatus = "healthy" | "warning" | "danger";

// ─── Single Metric ───────────────────────────────────────

export type MonitoringMetric = {
  /** Metric name (e.g. "funding", "delta", "pnl", "risk", "reconciliation"). */
  name: string;
  /** Current value. */
  value: number;
  /** Unit label (e.g. "$", "%", "events"). */
  unit?: string;
  /** Traffic-light status. */
  status: MonitoringStatus;
  /** Threshold that was compared against. */
  threshold?: number;
  /** Human-readable message. */
  message?: string;
};

// ─── Per-Position Snapshot ───────────────────────────────

export type PositionMonitoringSnapshot = {
  /** Position identifier. */
  positionId: string;
  /** Trading pair symbol. */
  symbol: string;
  /** Aggregated monitoring status for this position. */
  status: MonitoringStatus;
  /** Cumulative funding collected. */
  fundingCollectedUsd: number;
  /** Total PnL (trading + funding). */
  totalPnlUsd: number;
  /** Delta as a percentage. */
  deltaPercent: number;
  /** Status derived from Beta-5 risk report. */
  riskStatus: MonitoringStatus;
  /** Status derived from Beta-4 reconciliation report. */
  reconciliationStatus: MonitoringStatus;
  /** All individual metrics. */
  metrics: MonitoringMetric[];
};

// ─── Report ──────────────────────────────────────────────

export type MonitoringReport = {
  /** Per-position snapshots. */
  positions: PositionMonitoringSnapshot[];
  /** Aggregated portfolio monitoring status. */
  overallStatus: MonitoringStatus;
  /** Count of positions in warning state. */
  warningCount: number;
  /** Count of positions in danger state. */
  dangerCount: number;
  /** Timestamp (ms) when the report was generated. */
  generatedAt: number;
};

// ─── Config ──────────────────────────────────────────────

export type AutoMonitoringConfig = {
  /**
   * Maximum absolute delta percent before triggering danger (default 3).
   */
  maxDeltaPercent?: number;

  /**
   * Minimum cumulative funding collected before triggering warning (optional).
   */
  minFundingCollectedUsd?: number;

  /**
   * Maximum loss in USD before triggering danger (default 500).
   */
  maxLossUsd?: number;

  /**
   * Risk levels that map to danger (default ["critical", "high"]).
   */
  dangerRiskLevels?: string[];

  /**
   * Risk levels that map to warning (default ["medium"]).
   */
  warningRiskLevels?: string[];
};
