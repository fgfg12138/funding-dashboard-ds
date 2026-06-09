/**
 * Auto Monitoring Engine — Semi Phase 3
 *
 * Continuously monitors open arbitrage positions across five dimensions:
 * funding, delta, PnL, risk, and reconciliation.
 *
 * Pure functions — no side effects, no trading.
 */

import type { ArbitragePosition } from "../arbitrage/arbitragePositionTypes";
import type { RiskReport } from "../riskMonitoring/riskMonitoringTypes";
import type { PositionReconciliationReport } from "../positionReconciliation/positionReconciliationTypes";
import type {
  AutoMonitoringConfig,
  MonitoringMetric,
  MonitoringReport,
  MonitoringStatus,
  PositionMonitoringSnapshot,
} from "./autoMonitoringTypes";

// ─── Defaults ────────────────────────────────────────────

const DEFAULTS = {
  maxDeltaPercent: 3,
  maxLossUsd: 500,
  dangerRiskLevels: ["critical", "high"],
  warningRiskLevels: ["medium"],
};

function resolveConfig(c?: AutoMonitoringConfig): Required<AutoMonitoringConfig> {
  return {
    maxDeltaPercent: c?.maxDeltaPercent ?? DEFAULTS.maxDeltaPercent,
    minFundingCollectedUsd: c?.minFundingCollectedUsd ?? 0, // 0 = no warning threshold
    maxLossUsd: c?.maxLossUsd ?? DEFAULTS.maxLossUsd,
    dangerRiskLevels: c?.dangerRiskLevels ?? DEFAULTS.dangerRiskLevels,
    warningRiskLevels: c?.warningRiskLevels ?? DEFAULTS.warningRiskLevels,
  };
}

// ─── Individual Metric Builders ──────────────────────────

/**
 * Build a funding metric for a position.
 * Triggers warning if fundingCollectedUsd < minFundingCollectedUsd (> 0).
 */
export function buildFundingMetric(
  position: ArbitragePosition,
  config: Required<AutoMonitoringConfig>,
): MonitoringMetric {
  const value = position.fundingCollectedUsd;
  const threshold = config.minFundingCollectedUsd;

  let status: MonitoringStatus = "healthy";
  let message = `已收资金费 $${value.toFixed(2)}`;

  if (threshold > 0 && value < threshold) {
    status = "warning";
    message = `资金费 $${value.toFixed(2)} 低于 $${threshold}`;
  }

  return { name: "funding", value, unit: "$", status, threshold: threshold > 0 ? threshold : undefined, message };
}

/**
 * Build a delta metric for a position.
 * Triggers danger if |deltaPercent| > maxDeltaPercent.
 */
export function buildDeltaMetric(
  position: ArbitragePosition,
  config: Required<AutoMonitoringConfig>,
): MonitoringMetric {
  const value = position.deltaPercent;
  const threshold = config.maxDeltaPercent;
  const absValue = Math.abs(value);

  let status: MonitoringStatus = "healthy";
  let message = `Delta ${value.toFixed(2)}%`;

  if (absValue > threshold) {
    status = "danger";
    message = `Delta ${value.toFixed(2)}% 超过上限 ${threshold}%`;
  }

  return { name: "delta", value, unit: "%", status, threshold, message };
}

/**
 * Build a PnL metric for a position.
 * Triggers danger if totalPnlUsd <= -abs(maxLossUsd).
 */
export function buildPnlMetric(
  position: ArbitragePosition,
  config: Required<AutoMonitoringConfig>,
): MonitoringMetric {
  const value = position.totalPnlUsd;
  const threshold = config.maxLossUsd;

  let status: MonitoringStatus = "healthy";
  let message = `总盈亏 $${value.toFixed(2)}`;

  if (value <= -Math.abs(threshold)) {
    status = "danger";
    message = `亏损 $${value.toFixed(2)} 达到止损线 $${Math.abs(threshold)}`;
  }

  return { name: "pnl", value, unit: "$", status, threshold, message };
}

/**
 * Build a risk metric from the portfolio risk report.
 * Danger if overallRisk is in dangerRiskLevels.
 * Warning if overallRisk is in warningRiskLevels.
 */
export function buildRiskMetric(
  riskReport: RiskReport | undefined,
  config: Required<AutoMonitoringConfig>,
): MonitoringMetric {
  const riskLevel = riskReport?.overallRisk ?? "unknown";

  let status: MonitoringStatus = "healthy";
  let message = `整体风险 ${riskLevel}`;

  if (config.dangerRiskLevels.includes(riskLevel)) {
    status = "danger";
    message = `风险等级 ${riskLevel} — 需要关注`;
  } else if (config.warningRiskLevels.includes(riskLevel)) {
    status = "warning";
    message = `风险等级 ${riskLevel} — 建议关注`;
  }

  return { name: "risk", value: 0, unit: "level", status, message };
}

/**
 * Build a reconciliation metric from the position reconciliation report.
 * Danger if highSeverityCount > 0.
 * Warning if mismatchCount > 0.
 */
export function buildReconciliationMetric(
  reconciliationReport: PositionReconciliationReport | undefined,
): MonitoringMetric {
  if (!reconciliationReport) {
    return { name: "reconciliation", value: 0, status: "healthy", message: "无对账数据" };
  }

  const value = reconciliationReport.highSeverityCount;

  let status: MonitoringStatus = "healthy";
  let message = `对账一致 (${reconciliationReport.matchedCount} 匹配)`;

  if (reconciliationReport.highSeverityCount > 0) {
    status = "danger";
    message = `${reconciliationReport.highSeverityCount} 项高严重度对账异常`;
  } else if (reconciliationReport.mismatchCount > 0) {
    status = "warning";
    message = `${reconciliationReport.mismatchCount} 项对账差异`;
  }

  return { name: "reconciliation", value, unit: "issues", status, message };
}

// ─── Per-Position Monitoring ────────────────────────────

/**
 * Monitor a single position and produce a snapshot.
 *
 * Aggregates all five metrics. The worst metric status becomes
 * the position's overall status.
 */
export function monitorPosition(
  position: ArbitragePosition,
  riskReport: RiskReport | undefined,
  reconciliationReport: PositionReconciliationReport | undefined,
  config: Required<AutoMonitoringConfig>,
): PositionMonitoringSnapshot {
  const funding = buildFundingMetric(position, config);
  const delta = buildDeltaMetric(position, config);
  const pnl = buildPnlMetric(position, config);
  const risk = buildRiskMetric(riskReport, config);
  const reconciliation = buildReconciliationMetric(reconciliationReport);

  const metrics = [funding, delta, pnl, risk, reconciliation];

  // Worst status wins: danger > warning > healthy
  const metricStatuses = metrics.map((m) => m.status);
  let status: MonitoringStatus = "healthy";
  if (metricStatuses.includes("danger")) status = "danger";
  else if (metricStatuses.includes("warning")) status = "warning";

  return {
    positionId: position.id,
    symbol: position.symbol,
    status,
    fundingCollectedUsd: position.fundingCollectedUsd,
    totalPnlUsd: position.totalPnlUsd,
    deltaPercent: position.deltaPercent,
    riskStatus: risk.status,
    reconciliationStatus: reconciliation.status,
    metrics,
  };
}

// ─── Overall Status ─────────────────────────────────────

/**
 * Calculate the overall portfolio monitoring status.
 * danger > warning > healthy.
 */
export function calculateOverallMonitoringStatus(snapshots: PositionMonitoringSnapshot[]): MonitoringStatus {
  if (snapshots.some((s) => s.status === "danger")) return "danger";
  if (snapshots.some((s) => s.status === "warning")) return "warning";
  return "healthy";
}

// ─── Main Report Generator ─────────────────────────────

/**
 * Generate a full monitoring report for all open positions.
 *
 * @param localPositions       - Open arbitrage positions (Alpha-3).
 * @param riskReport           - Portfolio risk report (Beta-5).
 * @param reconciliationReport - Position reconciliation report (Beta-4).
 * @param config               - Monitoring thresholds.
 * @returns A MonitoringReport with per-position snapshots and overall status.
 */
export function generateMonitoringReport(
  localPositions: ArbitragePosition[],
  riskReport?: RiskReport,
  reconciliationReport?: PositionReconciliationReport,
  config?: AutoMonitoringConfig,
): MonitoringReport {
  const cfg = resolveConfig(config);

  const positions = localPositions.map((pos) =>
    monitorPosition(pos, riskReport, reconciliationReport, cfg),
  );

  const overallStatus = calculateOverallMonitoringStatus(positions);

  let warningCount = 0;
  let dangerCount = 0;

  for (const pos of positions) {
    if (pos.status === "danger") dangerCount++;
    else if (pos.status === "warning") warningCount++;
  }

  return {
    positions,
    overallStatus,
    warningCount,
    dangerCount,
    generatedAt: Date.now(),
  };
}
