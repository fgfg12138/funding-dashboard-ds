import type { ExchangeName } from "../exchanges/types";
import type { ExecutionOpportunityType, PaperExecution } from "./types";

export type PortfolioSummary = {
  totalExecutions: number;
  openExecutions: number;
  closedExecutions: number;
  failedExecutions: number;
  openNotionalUsd: number;
  closedNotionalUsd: number;
  estimatedClosedPnL: number;
  averageNetAnnualizedRate: number;
  averageFees: number;
  averageSlippage: number;
  byType: Record<ExecutionOpportunityType, number>;
  byExchange: Record<string, number>;
};

const HOURS_PER_YEAR = 8760;

/**
 * Sum total notional USD across all legs of an execution.
 */
function totalNotional(exec: PaperExecution): number {
  return exec.legs.reduce((s, leg) => s + leg.notionalUsd, 0);
}

/**
 * Estimate net PnL (USD) for a single closed execution.
 *
 * Formula:
 *   holdingHours = (closedAt - openedAt) / 3_600_000
 *   netReturn = (estimatedNetRate / 100) * (holdingHours / 8760) * notionalUsd
 */
function estimateClosedPnLFor(exec: PaperExecution): number {
  if (!exec.openedAt || !exec.closedAt) return 0;
  const holdingMs = exec.closedAt - exec.openedAt;
  if (holdingMs <= 0) return 0;
  const holdingHours = holdingMs / 3_600_000;
  const notional = totalNotional(exec);
  return (exec.estimatedNetRate / 100) * (holdingHours / HOURS_PER_YEAR) * notional;
}

/**
 * Build a full portfolio summary from a list of PaperExecution objects.
 *
 * This is a pure function — no side effects.
 */
export function summarizePaperPortfolio(executions: PaperExecution[]): PortfolioSummary {
  const openExes = executions.filter((e) => e.status === "opened");
  const closedExes = executions.filter((e) => e.status === "closed");
  const failedExes = executions.filter((e) => e.status === "failed");

  const openNotionalUsd = openExes.reduce((s, e) => s + totalNotional(e), 0);
  const closedNotionalUsd = closedExes.reduce((s, e) => s + totalNotional(e), 0);
  const estimatedClosedPnL = closedExes.reduce((s, e) => s + estimateClosedPnLFor(e), 0);

  const averageNetAnnualizedRate = calculateAverageNetAnnualizedRate(executions);
  const averageFees = calculateAverage(executions, (e) => e.estimatedFees);
  const averageSlippage = calculateAverage(executions, (e) => e.estimatedSlippage);

  const byType = groupExecutionsByType(executions);
  const byExchange = groupExecutionsByExchange(executions);

  return {
    totalExecutions: executions.length,
    openExecutions: openExes.length,
    closedExecutions: closedExes.length,
    failedExecutions: failedExes.length,
    openNotionalUsd,
    closedNotionalUsd,
    estimatedClosedPnL,
    averageNetAnnualizedRate,
    averageFees,
    averageSlippage,
    byType,
    byExchange,
  };
}

/** Sum of notional USD for all open executions. */
export function calculateOpenNotional(executions: PaperExecution[]): number {
  return executions
    .filter((e) => e.status === "opened")
    .reduce((s, e) => s + totalNotional(e), 0);
}

/** Sum of estimated closed PnL (USD) for all closed executions. */
export function calculateClosedPnL(executions: PaperExecution[]): number {
  return executions
    .filter((e) => e.status === "closed")
    .reduce((s, e) => s + estimateClosedPnLFor(e), 0);
}

/**
 * Weighted average of estimatedNetRate (annualized %).
 * Uses notional USD as the weight.
 */
export function calculateAverageNetAnnualizedRate(executions: PaperExecution[]): number {
  const withRate = executions.filter((e) => Number.isFinite(e.estimatedNetRate));
  if (withRate.length === 0) return 0;
  const totalWeight = withRate.reduce((s, e) => s + totalNotional(e), 0);
  if (totalWeight <= 0) return 0;
  const weightedSum = withRate.reduce((s, e) => s + e.estimatedNetRate * totalNotional(e), 0);
  return weightedSum / totalWeight;
}

/** Group executions by opportunity type, returning a count per type. */
export function groupExecutionsByType(
  executions: PaperExecution[],
): Record<ExecutionOpportunityType, number> {
  const result: Record<string, number> = { "spot-perp": 0, "cross-exchange": 0, basis: 0, unknown: 0 };
  for (const e of executions) {
    const key = e.opportunityType in result ? e.opportunityType : "unknown";
    result[key]++;
  }
  return result as Record<ExecutionOpportunityType, number>;
}

/** Group executions by exchange name, returning a count per exchange. */
export function groupExecutionsByExchange(
  executions: PaperExecution[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const e of executions) {
    for (const exchange of e.exchanges) {
      result[exchange] = (result[exchange] ?? 0) + 1;
    }
  }
  return result;
}

// ─── Helpers ────────────────────────────────────────────

function calculateAverage(executions: PaperExecution[], fn: (e: PaperExecution) => number): number {
  const filtered = executions.filter((e) => Number.isFinite(fn(e)));
  if (filtered.length === 0) return 0;
  return filtered.reduce((s, e) => s + fn(e), 0) / filtered.length;
}
