/**
 * Portfolio Engine — Alpha Phase A7
 *
 * Aggregates multiple arbitrage positions into a single portfolio
 * view — total funding, trading PnL, delta, APY, and utilisation.
 *
 * Pure functions — no side effects.
 */

import type { ArbitragePosition } from "./arbitragePositionTypes";
import type {
  PortfolioEngineConfig,
  PortfolioPositionContribution,
  PortfolioPositionInput,
  PortfolioReport,
  PortfolioSummary,
} from "./portfolioTypes";

// ─── Defaults ────────────────────────────────────────────

const DEFAULT_ANNUALIZATION_HOURS = 8760; // 365 days
const DEFAULT_INCLUDE_CLOSED = true;

// ─── Helpers ─────────────────────────────────────────────

function getEarliestOpenedAt(inputs: PortfolioPositionInput[]): number {
  let earliest = Infinity;
  for (const item of inputs) {
    if (item.position.openedAt < earliest) {
      earliest = item.position.openedAt;
    }
  }
  return earliest === Infinity ? Date.now() : earliest;
}

function calcAllocatedCapital(position: ArbitragePosition, allocatedCapitalUsd?: number): number {
  if (allocatedCapitalUsd !== undefined && allocatedCapitalUsd > 0) {
    return allocatedCapitalUsd;
  }
  // Fallback: max notional of the two legs
  return Math.max(position.spotLeg.notionalUsd, position.perpetualLeg.notionalUsd);
}

/** Trading PnL = spotPnL + perpPnL (excludes funding). */
function calcTradingPnl(position: ArbitragePosition): number {
  return position.spotLeg.unrealizedPnlUsd + position.perpetualLeg.unrealizedPnlUsd;
}

// ─── Public API ──────────────────────────────────────────

/**
 * Calculate the portfolio APY.
 *
 * portfolioApyPercent = totalPnlUsd / totalAllocatedCapitalUsd
 *                       * (annualizationHours / holdingHours) * 100
 *
 * Returns 0 when capital or holding time is invalid.
 */
export function calculatePortfolioApy(
  totalPnlUsd: number,
  totalAllocatedCapitalUsd: number,
  holdingHours: number,
  annualizationHours: number = DEFAULT_ANNUALIZATION_HOURS,
): number {
  if (totalAllocatedCapitalUsd <= 0 || holdingHours <= 0) return 0;
  return (totalPnlUsd / totalAllocatedCapitalUsd) * (annualizationHours / holdingHours) * 100;
}

/**
 * Calculate capital utilisation percentage.
 *
 * capitalUtilizationPercent = totalAllocatedCapitalUsd / totalCapitalUsd * 100
 */
export function calculateCapitalUtilization(
  totalAllocatedCapitalUsd: number,
  totalCapitalUsd: number,
): number {
  if (totalCapitalUsd <= 0) return 0;
  return (totalAllocatedCapitalUsd / totalCapitalUsd) * 100;
}

/**
 * Calculate the contribution breakdown for a single position.
 */
export function calculatePositionContribution(
  input: PortfolioPositionInput,
  totalPnlUsd: number,
): PortfolioPositionContribution {
  const position = input.position;
  const allocated = calcAllocatedCapital(position, input.allocatedCapitalUsd);
  const notional = position.spotLeg.notionalUsd + position.perpetualLeg.notionalUsd;
  const tradingPnl = calcTradingPnl(position);
  const deltaPercent = allocated > 0 ? (position.deltaUsd / allocated) * 100 : 0;
  const contributionPercent = totalPnlUsd !== 0
    ? (position.totalPnlUsd / totalPnlUsd) * 100
    : 0;

  return {
    positionId: position.id,
    symbol: position.symbol,
    status: position.status,
    allocatedCapitalUsd: allocated,
    notionalUsd: notional,
    fundingCollectedUsd: position.fundingCollectedUsd,
    tradingPnlUsd: tradingPnl,
    totalPnlUsd: position.totalPnlUsd,
    deltaUsd: position.deltaUsd,
    deltaPercent,
    contributionPercent,
  };
}

/**
 * Build a portfolio summary from a list of position inputs.
 */
export function calculatePortfolioSummary(
  inputs: PortfolioPositionInput[],
  config: PortfolioEngineConfig,
  generatedAt?: number,
): PortfolioSummary {
  const annualizationHours = config.annualizationHours ?? DEFAULT_ANNUALIZATION_HOURS;
  const includeClosed = config.includeClosedPositions ?? DEFAULT_INCLUDE_CLOSED;
  const now = generatedAt ?? Date.now();

  const filtered = includeClosed
    ? inputs
    : inputs.filter((item) => item.position.status === "open");

  let totalAllocatedCapitalUsd = 0;
  let totalNotionalUsd = 0;
  let totalFundingCollectedUsd = 0;
  let totalTradingPnlUsd = 0;
  let totalPnlUsd = 0;
  let totalDeltaUsd = 0;
  let openCount = 0;
  let closedCount = 0;

  for (const item of filtered) {
    const allocated = calcAllocatedCapital(item.position, item.allocatedCapitalUsd);
    totalAllocatedCapitalUsd += allocated;
    totalNotionalUsd += item.position.spotLeg.notionalUsd + item.position.perpetualLeg.notionalUsd;
    totalFundingCollectedUsd += item.position.fundingCollectedUsd;
    totalTradingPnlUsd += calcTradingPnl(item.position);
    totalPnlUsd += item.position.totalPnlUsd;
    totalDeltaUsd += item.position.deltaUsd;

    if (item.position.status === "open") openCount++;
    else if (item.position.status === "closed") closedCount++;
  }

  // Holding hours = from earliest openedAt to now
  const earliestOpened = getEarliestOpenedAt(filtered);
  const holdingMs = now - earliestOpened;
  const holdingHours = Math.max(0, holdingMs / (60 * 60 * 1000));

  const portfolioApyPercent = calculatePortfolioApy(
    totalPnlUsd,
    totalAllocatedCapitalUsd,
    holdingHours,
    annualizationHours,
  );

  const capitalUtilizationPercent = calculateCapitalUtilization(
    totalAllocatedCapitalUsd,
    config.totalCapitalUsd,
  );

  const totalDeltaPercent = totalAllocatedCapitalUsd > 0
    ? (totalDeltaUsd / totalAllocatedCapitalUsd) * 100
    : 0;

  return {
    totalAllocatedCapitalUsd,
    totalNotionalUsd,
    totalFundingCollectedUsd,
    totalTradingPnlUsd,
    totalPnlUsd,
    portfolioApyPercent,
    capitalUtilizationPercent,
    totalDeltaUsd,
    totalDeltaPercent,
    openPositionCount: openCount,
    closedPositionCount: closedCount,
    positionCount: filtered.length,
    generatedAt: now,
  };
}

/**
 * Generate a full portfolio report including summary + per-position contributions.
 */
export function calculatePortfolioReport(
  inputs: PortfolioPositionInput[],
  config: PortfolioEngineConfig,
  generatedAt?: number,
): PortfolioReport {
  const summary = calculatePortfolioSummary(inputs, config, generatedAt);
  const includeClosed = config.includeClosedPositions ?? DEFAULT_INCLUDE_CLOSED;

  const filtered = includeClosed
    ? inputs
    : inputs.filter((item) => item.position.status === "open");

  const contributions = filtered.map((item) =>
    calculatePositionContribution(item, summary.totalPnlUsd),
  );

  return { summary, contributions };
}
