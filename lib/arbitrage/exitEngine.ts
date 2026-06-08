/**
 * Exit Engine — Alpha Phase A5
 *
 * Evaluates whether a funding arbitrage position should be closed,
 * based on configurable thresholds for net APY, delta, holding time,
 * funding decline, take-profit, and stop-loss.
 *
 * Pure functions — no side effects, no position mutation.
 */

import type { ArbitragePosition } from "./arbitragePositionTypes";
import type {
  ExitDecision,
  ExitDecisionMetrics,
  ExitEngineConfig,
  ExitMarketContext,
  ExitReason,
  ExitSeverity,
} from "./exitEngineTypes";

// ─── Defaults ────────────────────────────────────────────

const DEFAULT_MIN_NET_APY = 10;
const DEFAULT_MAX_DELTA_PERCENT = 3;
const DEFAULT_MAX_HOLDING_HOURS = 48;
const DEFAULT_FUNDING_DECLINE_THRESHOLD = 50; // percent

// ─── Severity helpers ───────────────────────────────────

const HIGH_SEVERITY_REASONS: ReadonlySet<ExitReason> = new Set([
  "stop_loss_reached",
  "delta_too_high",
  "risk_increased",
]);

/**
 * Compute aggregate severity from a set of reasons.
 */
function aggregateSeverity(reasons: ExitReason[]): ExitSeverity {
  if (reasons.length === 0) return "low";
  if (reasons.some((r) => HIGH_SEVERITY_REASONS.has(r))) return "high";
  return "medium";
}

/**
 * Build a human-readable message from triggered reasons.
 */
function buildMessage(reasons: ExitReason[], holdingHours: number): string {
  if (reasons.length === 0) return "持有（无退出信号）";

  const labels: Record<ExitReason, string> = {
    funding_declined: "资金费率显著下降",
    net_apy_too_low: "预期净年化低于阈值",
    risk_increased: "风险增加",
    max_holding_time_exceeded: `持仓超过最大持有时间 (${Math.round(holdingHours)}h)`,
    take_profit_reached: "达到止盈目标",
    stop_loss_reached: "达到止损线",
    delta_too_high: "Delta 偏离过高",
  };

  return reasons.map((r) => labels[r]).join("；");
}

/**
 * Build the metrics snapshot.
 */
function buildMetrics(
  position: ArbitragePosition,
  context: ExitMarketContext,
): ExitDecisionMetrics {
  const holdingMs = context.currentTime - position.openedAt;
  const holdingHours = holdingMs / (60 * 60 * 1000);

  return {
    totalPnlUsd: position.totalPnlUsd,
    fundingCollectedUsd: position.fundingCollectedUsd,
    deltaPercent: position.deltaPercent,
    currentNetApy: context.currentNetApy,
    currentFundingRate: context.currentFundingRate,
    holdingHours,
  };
}

// ─── Individual Evaluators ───────────────────────────────

/**
 * Evaluate whether the funding rate has declined significantly
 * since entry.
 */
export function evaluateFundingDecline(
  currentFundingRate: number,
  entryFundingRate: number,
  thresholdPercent: number = DEFAULT_FUNDING_DECLINE_THRESHOLD,
): boolean {
  const absEntry = Math.abs(entryFundingRate);
  if (absEntry === 0) return false;

  const declinePercent = ((entryFundingRate - currentFundingRate) / absEntry) * 100;
  return declinePercent >= thresholdPercent;
}

/**
 * Evaluate whether the current net APY is below the minimum threshold.
 */
export function evaluateNetApyExit(
  currentNetApy: number,
  minNetApyPercent: number = DEFAULT_MIN_NET_APY,
): boolean {
  return currentNetApy < minNetApyPercent;
}

/**
 * Evaluate whether the absolute delta percent exceeds the maximum.
 */
export function evaluateDeltaExit(
  deltaPercent: number,
  maxDeltaPercent: number = DEFAULT_MAX_DELTA_PERCENT,
): boolean {
  return Math.abs(deltaPercent) > maxDeltaPercent;
}

/**
 * Evaluate whether the position has been held longer than allowed.
 */
export function evaluateHoldingTimeExit(
  openedAt: number,
  currentTime: number,
  maxHoldingHours: number = DEFAULT_MAX_HOLDING_HOURS,
): boolean {
  const elapsedMs = currentTime - openedAt;
  const elapsedHours = elapsedMs / (60 * 60 * 1000);
  return elapsedHours >= maxHoldingHours;
}

/**
 * Evaluate whether take-profit has been reached.
 */
export function evaluateTakeProfit(
  totalPnlUsd: number,
  takeProfitUsd: number,
): boolean {
  return totalPnlUsd >= takeProfitUsd;
}

/**
 * Evaluate whether stop-loss has been reached.
 */
export function evaluateStopLoss(
  totalPnlUsd: number,
  stopLossUsd: number,
): boolean {
  return totalPnlUsd <= -Math.abs(stopLossUsd);
}

// ─── Main Evaluator ──────────────────────────────────────

/**
 * Run all exit checks against a position and return an ExitDecision.
 *
 * The original position is NOT mutated.
 */
export function evaluateExit(
  position: ArbitragePosition,
  config?: ExitEngineConfig,
  context?: Partial<ExitMarketContext>,
): ExitDecision {
  const resolvedConfig: Required<ExitEngineConfig> = {
    minNetApyPercent: config?.minNetApyPercent ?? DEFAULT_MIN_NET_APY,
    maxDeltaPercent: config?.maxDeltaPercent ?? DEFAULT_MAX_DELTA_PERCENT,
    maxHoldingHours: config?.maxHoldingHours ?? DEFAULT_MAX_HOLDING_HOURS,
    takeProfitUsd: config?.takeProfitUsd ?? undefined as unknown as number,
    stopLossUsd: config?.stopLossUsd ?? undefined as unknown as number,
    minFundingRate: config?.minFundingRate ?? undefined as unknown as number,
    fundingDeclineThresholdPercent: config?.fundingDeclineThresholdPercent ?? DEFAULT_FUNDING_DECLINE_THRESHOLD,
  } as Required<ExitEngineConfig>;

  const resolvedContext: ExitMarketContext = {
    currentTime: context?.currentTime ?? Date.now(),
    currentFundingRate: context?.currentFundingRate,
    entryFundingRate: context?.entryFundingRate,
    currentNetApy: context?.currentNetApy,
    riskScore: context?.riskScore,
    liquidityScore: context?.liquidityScore,
    volatilityScore: context?.volatilityScore,
  };

  const reasons: ExitReason[] = [];

  // 1. Funding decline
  if (
    resolvedContext.entryFundingRate !== undefined &&
    resolvedContext.currentFundingRate !== undefined
  ) {
    const declined = evaluateFundingDecline(
      resolvedContext.currentFundingRate,
      resolvedContext.entryFundingRate,
      resolvedConfig.fundingDeclineThresholdPercent ?? DEFAULT_FUNDING_DECLINE_THRESHOLD,
    );
    if (declined) reasons.push("funding_declined");
  }

  // 2. Net APY too low
  if (resolvedContext.currentNetApy !== undefined) {
    const tooLow = evaluateNetApyExit(
      resolvedContext.currentNetApy,
      resolvedConfig.minNetApyPercent,
    );
    if (tooLow) reasons.push("net_apy_too_low");
  }

  // 3. Delta too high
  const deltaTooHigh = evaluateDeltaExit(
    position.deltaPercent,
    resolvedConfig.maxDeltaPercent,
  );
  if (deltaTooHigh) reasons.push("delta_too_high");

  // 4. Holding time exceeded
  const holdingTooLong = evaluateHoldingTimeExit(
    position.openedAt,
    resolvedContext.currentTime,
    resolvedConfig.maxHoldingHours,
  );
  if (holdingTooLong) reasons.push("max_holding_time_exceeded");

  // 5. Take-profit
  if (resolvedConfig.takeProfitUsd !== undefined) {
    const tp = evaluateTakeProfit(position.totalPnlUsd, resolvedConfig.takeProfitUsd);
    if (tp) reasons.push("take_profit_reached");
  }

  // 6. Stop-loss
  if (resolvedConfig.stopLossUsd !== undefined) {
    const sl = evaluateStopLoss(position.totalPnlUsd, resolvedConfig.stopLossUsd);
    if (sl) reasons.push("stop_loss_reached");
  }

  // Build result
  const shouldExit = reasons.length > 0;
  const severity = aggregateSeverity(reasons);
  const metrics = buildMetrics(position, resolvedContext);
  const message = buildMessage(reasons, metrics.holdingHours);

  return {
    shouldExit,
    reasons,
    severity,
    message,
    checkedAt: resolvedContext.currentTime,
    metrics,
  };
}
