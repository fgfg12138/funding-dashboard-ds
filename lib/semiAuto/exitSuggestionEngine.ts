/**
 * Exit Suggestion Engine — Semi Phase 4
 *
 * Evaluates open positions against configurable thresholds and generates
 * human-readable exit suggestions (hold / suggest_exit / urgent_exit).
 *
 * Pure functions — no trading, no execution.
 */

import type { ArbitragePosition } from "../arbitrage/arbitragePositionTypes";
import type { RiskReport } from "../riskMonitoring/riskMonitoringTypes";
import type { PositionReconciliationReport } from "../positionReconciliation/positionReconciliationTypes";
import type {
  ExitReason,
  ExitSuggestionConfig,
  ExitSuggestionReport,
  ExitSuggestionSeverity,
  ExitSuggestionStatus,
  PositionExitSuggestion,
} from "./exitSuggestionTypes";

// ─── Defaults ────────────────────────────────────────────

const DEFAULTS = {
  minNetApyPercent: 10,
  maxDeltaPercent: 3,
  maxHoldingHours: 48,
  takeProfitUsd: 500,
  stopLossUsd: 500,
  urgentRiskLevels: ["critical"],
  warningRiskLevels: ["high", "medium"],
};

function resolveConfig(c?: ExitSuggestionConfig): Required<ExitSuggestionConfig> {
  return {
    minNetApyPercent: c?.minNetApyPercent ?? DEFAULTS.minNetApyPercent,
    maxDeltaPercent: c?.maxDeltaPercent ?? DEFAULTS.maxDeltaPercent,
    maxHoldingHours: c?.maxHoldingHours ?? DEFAULTS.maxHoldingHours,
    takeProfitUsd: c?.takeProfitUsd ?? DEFAULTS.takeProfitUsd,
    stopLossUsd: c?.stopLossUsd ?? DEFAULTS.stopLossUsd,
    urgentRiskLevels: c?.urgentRiskLevels ?? DEFAULTS.urgentRiskLevels,
    warningRiskLevels: c?.warningRiskLevels ?? DEFAULTS.warningRiskLevels,
  };
}

const URGENT_REASONS: ReadonlySet<ExitReason> = new Set([
  "stop_loss_triggered",
  "risk_too_high",
  "reconciliation_issue",
]);

const HIGH_SEVERITY_REASONS: ReadonlySet<ExitReason> = new Set([
  "stop_loss_triggered",
  "risk_too_high",
  "reconciliation_issue",
]);

// ─── Build Exit Reasons ───────────────────────────────

/**
 * Evaluate all exit conditions and return triggered reasons.
 *
 * Each condition is checked independently (no else-if chains).
 */
export function buildExitReasons(
  position: ArbitragePosition,
  riskReport: RiskReport | undefined,
  reconciliationReport: PositionReconciliationReport | undefined,
  currentTime: number,
  config: Required<ExitSuggestionConfig>,
): ExitReason[] {
  const reasons: ExitReason[] = [];

  // 1. Delta too high
  if (Math.abs(position.deltaPercent) > config.maxDeltaPercent) {
    reasons.push("delta_too_high");
  }

  // 2. Risk too high
  if (riskReport && config.urgentRiskLevels.includes(riskReport.overallRisk)) {
    reasons.push("risk_too_high");
  } else if (riskReport && config.warningRiskLevels.includes(riskReport.overallRisk)) {
    reasons.push("risk_too_high");
  }

  // 3. Reconciliation issue
  if (reconciliationReport && reconciliationReport.highSeverityCount > 0) {
    reasons.push("reconciliation_issue");
  }

  // 4. Max holding time exceeded
  const holdingMs = currentTime - position.openedAt;
  const holdingHours = holdingMs / (60 * 60 * 1000);
  if (holdingHours > config.maxHoldingHours) {
    reasons.push("max_holding_time_exceeded");
  }

  // 5. Take-profit reached
  if (position.totalPnlUsd >= config.takeProfitUsd) {
    reasons.push("pnl_target_reached");
  }

  // 6. Stop-loss triggered
  if (position.totalPnlUsd <= -Math.abs(config.stopLossUsd)) {
    reasons.push("stop_loss_triggered");
  }

  return reasons;
}

/**
 * Calculate severity from triggered reasons.
 * high > medium > low.
 */
export function calculateExitSeverity(reasons: ExitReason[]): ExitSuggestionSeverity {
  if (reasons.some((r) => HIGH_SEVERITY_REASONS.has(r))) return "high";
  if (reasons.length > 0) return "medium";
  return "low";
}

/**
 * Build a human-readable message from triggered reasons.
 */
export function buildExitMessage(
  reasons: ExitReason[],
  totalPnlUsd: number,
  holdingHours: number,
): string {
  if (reasons.length === 0) return "继续持有，无需退出";

  const parts: string[] = [];

  for (const reason of reasons) {
    switch (reason) {
      case "funding_declined":
        parts.push("资金费率下降，收益不再具有吸引力");
        break;
      case "delta_too_high":
        parts.push("Delta 敞口超出阈值");
        break;
      case "risk_too_high":
        parts.push("组合风险等级过高");
        break;
      case "reconciliation_issue":
        parts.push("仓位对账存在异常");
        break;
      case "max_holding_time_exceeded":
        parts.push(`持仓超过最大时间 (${Math.round(holdingHours)}h)`);
        break;
      case "pnl_target_reached":
        parts.push(`达到止盈目标: $${totalPnlUsd.toFixed(2)}`);
        break;
      case "stop_loss_triggered":
        parts.push(`触发止损线: $${totalPnlUsd.toFixed(2)}`);
        break;
    }
  }

  return parts.join("；");
}

/**
 * Determine the overall exit suggestion status from reasons.
 * urgent_exit > suggest_exit > hold.
 */
function determineStatus(reasons: ExitReason[]): ExitSuggestionStatus {
  if (reasons.length === 0) return "hold";
  if (reasons.some((r) => URGENT_REASONS.has(r))) return "urgent_exit";
  return "suggest_exit";
}

// ─── Per-Position Evaluation ──────────────────────────

/**
 * Evaluate a single position and return an exit suggestion.
 */
export function evaluateExitSuggestion(
  position: ArbitragePosition,
  riskReport: RiskReport | undefined,
  reconciliationReport: PositionReconciliationReport | undefined,
  currentTime: number,
  config: ExitSuggestionConfig,
): PositionExitSuggestion {
  const cfg = resolveConfig(config);

  const reasons = buildExitReasons(position, riskReport, reconciliationReport, currentTime, cfg);
  const severity = calculateExitSeverity(reasons);
  const status = determineStatus(reasons);

  const holdingMs = currentTime - position.openedAt;
  const holdingHours = holdingMs / (60 * 60 * 1000);
  const message = buildExitMessage(reasons, position.totalPnlUsd, holdingHours);

  return {
    positionId: position.id,
    symbol: position.symbol,
    status,
    reasons,
    severity,
    message,
    totalPnlUsd: position.totalPnlUsd,
    fundingCollectedUsd: position.fundingCollectedUsd,
    generatedAt: Date.now(),
  };
}

// ─── Main Report Generator ─────────────────────────────

/**
 * Generate a full exit suggestion report for all positions.
 *
 * @param positions            - Open arbitrage positions.
 * @param riskReport           - Portfolio risk report (Beta-5).
 * @param reconciliationReport - Position reconciliation report (Beta-4).
 * @param currentTime          - Current simulated time (ms).
 * @param config               - Suggestion thresholds.
 * @returns ExitSuggestionReport with per-position suggestions.
 */
export function generateExitSuggestions(
  positions: ArbitragePosition[],
  riskReport?: RiskReport,
  reconciliationReport?: PositionReconciliationReport,
  currentTime?: number,
  config?: ExitSuggestionConfig,
): ExitSuggestionReport {
  const now = currentTime ?? Date.now();

  const suggestions = positions.map((pos) =>
    evaluateExitSuggestion(pos, riskReport, reconciliationReport, now, config ?? {}),
  );

  let holdCount = 0;
  let suggestExitCount = 0;
  let urgentExitCount = 0;

  for (const s of suggestions) {
    if (s.status === "hold") holdCount++;
    else if (s.status === "suggest_exit") suggestExitCount++;
    else if (s.status === "urgent_exit") urgentExitCount++;
  }

  return {
    suggestions,
    holdCount,
    suggestExitCount,
    urgentExitCount,
    generatedAt: Date.now(),
  };
}
