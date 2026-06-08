/**
 * Risk Monitoring Engine — Beta Phase 5
 *
 * Evaluates portfolio risk across six dimensions: leverage, margin,
 * liquidation distance, delta, position size, and reconciliation status.
 *
 * Pure functions — no side effects, no automated trading.
 */

import type { AccountPosition } from "../accountSync/accountSyncTypes";
import type { ArbitragePosition } from "../arbitrage/arbitragePositionTypes";
import type { PositionReconciliationReport } from "../positionReconciliation/positionReconciliationTypes";
import type {
  RiskCategory,
  RiskEvent,
  RiskMonitoringConfig,
  RiskReport,
  RiskSeverity,
} from "./riskMonitoringTypes";

// ─── Defaults ────────────────────────────────────────────

const DEFAULTS = {
  maxLeverage: 5,
  minMarginRatioPercent: 20,
  minLiquidationDistancePercent: 10,
  maxDeltaPercent: 3,
  maxPositionNotionalUsd: 50_000,
  allowOpenReconciliationIssues: false,
};

let _eventSeq = 0;
function nextId(): string {
  _eventSeq += 1;
  return `risk-${String(_eventSeq).padStart(6, "0")}`;
}

function resolveConfig(c?: RiskMonitoringConfig): Required<RiskMonitoringConfig> {
  return {
    maxLeverage: c?.maxLeverage ?? DEFAULTS.maxLeverage,
    minMarginRatioPercent: c?.minMarginRatioPercent ?? DEFAULTS.minMarginRatioPercent,
    minLiquidationDistancePercent: c?.minLiquidationDistancePercent ?? DEFAULTS.minLiquidationDistancePercent,
    maxDeltaPercent: c?.maxDeltaPercent ?? DEFAULTS.maxDeltaPercent,
    maxPositionNotionalUsd: c?.maxPositionNotionalUsd ?? DEFAULTS.maxPositionNotionalUsd,
    allowOpenReconciliationIssues: c?.allowOpenReconciliationIssues ?? DEFAULTS.allowOpenReconciliationIssues,
  };
}

function makeEvent(
  category: RiskCategory,
  severity: RiskSeverity,
  title: string,
  message: string,
  overrides?: { exchange?: string; symbol?: string; positionId?: string; value?: number; threshold?: number },
): RiskEvent {
  return {
    id: nextId(),
    category,
    severity,
    title,
    message,
    createdAt: Date.now(),
    ...overrides,
  };
}

// ─── Individual Checks ──────────────────────────────────

/**
 * Check if any account position exceeds max leverage.
 */
export function checkLeverageRisk(
  accountPositions: AccountPosition[],
  config: Required<RiskMonitoringConfig>,
): RiskEvent[] {
  const events: RiskEvent[] = [];

  for (const pos of accountPositions) {
    if (pos.leverage !== undefined && pos.leverage > config.maxLeverage) {
      events.push(makeEvent(
        "leverage", "high",
        `杠杆过高: ${pos.symbol}`,
        `${pos.symbol} 杠杆率 ${pos.leverage}x 超过上限 ${config.maxLeverage}x`,
        { exchange: pos.exchange, symbol: pos.symbol, value: pos.leverage, threshold: config.maxLeverage },
      ));
    }
  }

  return events;
}

/**
 * Check if any account position has margin ratio below minimum.
 * Uses unrealizedPnl / (quantity * entryPrice) as a simplified margin ratio proxy.
 */
export function checkMarginRisk(
  accountPositions: AccountPosition[],
  config: Required<RiskMonitoringConfig>,
): RiskEvent[] {
  const events: RiskEvent[] = [];

  for (const pos of accountPositions) {
    if (pos.leverage === undefined || pos.leverage === 0) continue;

    // Simplified margin ratio: notional / (leverage * margin)
    // A more accurate ratio would come from the exchange API
    const notional = pos.quantity * (pos.markPrice ?? pos.entryPrice);
    const initialMargin = notional / pos.leverage;
    const pnl = pos.unrealizedPnl ?? 0;
    const marginRatio = initialMargin > 0 ? ((initialMargin + pnl) / notional) * 100 : 0;

    if (marginRatio < config.minMarginRatioPercent) {
      events.push(makeEvent(
        "margin", "high",
        `保证金不足: ${pos.symbol}`,
        `${pos.symbol} 预估保证金率 ${marginRatio.toFixed(2)}% 低于最低 ${config.minMarginRatioPercent}%`,
        { exchange: pos.exchange, symbol: pos.symbol, value: marginRatio, threshold: config.minMarginRatioPercent },
      ));
    }
  }

  return events;
}

/**
 * Check if any account position is too close to liquidation.
 * Uses a simplified distance metric based on PnL and margin.
 */
export function checkLiquidationRisk(
  accountPositions: AccountPosition[],
  config: Required<RiskMonitoringConfig>,
): RiskEvent[] {
  const events: RiskEvent[] = [];

  for (const pos of accountPositions) {
    if (pos.leverage === undefined || pos.leverage === 0 || pos.markPrice === undefined) continue;

    const notional = pos.quantity * pos.markPrice;
    const entryNotional = pos.quantity * pos.entryPrice;
    const initialMargin = notional / pos.leverage;

    if (initialMargin <= 0) continue;

    // Simplified liquidation distance: how much PnL can be lost before margin is wiped
    // Distance = (initialMargin + unrealizedPnl) / notional * 100
    const pnl = pos.unrealizedPnl ?? 0;
    const distancePercent = (initialMargin + pnl) / notional * 100;

    if (distancePercent < config.minLiquidationDistancePercent) {
      events.push(makeEvent(
        "liquidation", "critical",
        `爆仓风险: ${pos.symbol}`,
        `${pos.symbol} 预估爆仓距离 ${distancePercent.toFixed(2)}% 低于最低 ${config.minLiquidationDistancePercent}%`,
        { exchange: pos.exchange, symbol: pos.symbol, value: distancePercent, threshold: config.minLiquidationDistancePercent },
      ));
    }
  }

  return events;
}

/**
 * Check if any local arbitrage position exceeds max delta percent.
 */
export function checkDeltaRisk(
  localPositions: ArbitragePosition[],
  config: Required<RiskMonitoringConfig>,
): RiskEvent[] {
  const events: RiskEvent[] = [];

  for (const pos of localPositions) {
    const absDelta = Math.abs(pos.deltaPercent);
    if (absDelta > config.maxDeltaPercent) {
      events.push(makeEvent(
        "delta", "medium",
        `Delta 偏离: ${pos.symbol}`,
        `${pos.symbol} Delta ${absDelta.toFixed(2)}% 超过上限 ${config.maxDeltaPercent}%`,
        { exchange: pos.perpetualLeg.exchange, symbol: pos.symbol, positionId: pos.id, value: pos.deltaPercent, threshold: config.maxDeltaPercent },
      ));
    }
  }

  return events;
}

/**
 * Check if any local arbitrage position exceeds max notional.
 */
export function checkPositionRisk(
  localPositions: ArbitragePosition[],
  config: Required<RiskMonitoringConfig>,
): RiskEvent[] {
  const events: RiskEvent[] = [];

  for (const pos of localPositions) {
    const notional = Math.max(pos.spotLeg.notionalUsd, pos.perpetualLeg.notionalUsd);
    if (notional > config.maxPositionNotionalUsd) {
      events.push(makeEvent(
        "position", "medium",
        `仓位过大: ${pos.symbol}`,
        `${pos.symbol} 名义价值 $${notional.toLocaleString()} 超过上限 $${config.maxPositionNotionalUsd.toLocaleString()}`,
        { exchange: pos.perpetualLeg.exchange, symbol: pos.symbol, positionId: pos.id, value: notional, threshold: config.maxPositionNotionalUsd },
      ));
    }
  }

  return events;
}

/**
 * Check the reconciliation report for high-severity mismatches.
 */
export function checkReconciliationRisk(
  reconciliationReport: PositionReconciliationReport | undefined,
  config: Required<RiskMonitoringConfig>,
): RiskEvent[] {
  const events: RiskEvent[] = [];

  if (!reconciliationReport || config.allowOpenReconciliationIssues) return events;

  const highSeverityStatuses = new Set(["missing_on_exchange", "missing_locally", "side_mismatch"]);

  for (const item of reconciliationReport.items) {
    if (highSeverityStatuses.has(item.status)) {
      events.push(makeEvent(
        "reconciliation", "high",
        `仓位对账异常: ${item.symbol}`,
        item.message,
        { exchange: item.exchange, symbol: item.symbol, positionId: item.localPositionId },
      ));
    }
  }

  return events;
}

/**
 * Calculate the overall portfolio risk level.
 *
 * Rules:
 *  - If any critical event → "critical"
 *  - Else if any high event → "high"
 *  - Else if any medium event → "medium"
 *  - Else → "low"
 */
export function calculateOverallRisk(events: RiskEvent[]): RiskSeverity {
  if (events.some((e) => e.severity === "critical")) return "critical";
  if (events.some((e) => e.severity === "high")) return "high";
  if (events.some((e) => e.severity === "medium")) return "medium";
  return "low";
}

// ─── Main Report Generator ──────────────────────────────

/**
 * Generate a complete risk report from all available data sources.
 *
 * @param accountPositions     - Positions from exchange Account Sync (Beta-2).
 * @param localPositions       - Local arbitrage positions (Alpha-3).
 * @param reconciliationReport - Latest position reconciliation report (Beta-4).
 * @param config               - Risk thresholds configuration.
 * @returns A RiskReport containing all triggered risk events and overall risk level.
 */
export function generateRiskReport(
  accountPositions: AccountPosition[],
  localPositions: ArbitragePosition[],
  reconciliationReport?: PositionReconciliationReport,
  config?: RiskMonitoringConfig,
): RiskReport {
  const cfg = resolveConfig(config);

  const events: RiskEvent[] = [
    ...checkLeverageRisk(accountPositions, cfg),
    ...checkMarginRisk(accountPositions, cfg),
    ...checkLiquidationRisk(accountPositions, cfg),
    ...checkDeltaRisk(localPositions, cfg),
    ...checkPositionRisk(localPositions, cfg),
    ...checkReconciliationRisk(reconciliationReport, cfg),
  ];

  let lowCount = 0;
  let mediumCount = 0;
  let highCount = 0;
  let criticalCount = 0;

  for (const e of events) {
    switch (e.severity) {
      case "low": lowCount++; break;
      case "medium": mediumCount++; break;
      case "high": highCount++; break;
      case "critical": criticalCount++; break;
    }
  }

  return {
    events,
    lowCount,
    mediumCount,
    highCount,
    criticalCount,
    overallRisk: calculateOverallRisk(events),
    generatedAt: Date.now(),
  };
}
