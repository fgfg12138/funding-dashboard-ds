/**
 * Capital Manager Engine — Live Phase 5
 *
 * Manages capital allocation decisions: computes available capital,
 * applies compounding, and validates allocation requests against
 * utilisation, position size, and reserve constraints.
 *
 * Reuses Alpha-6 Capital Allocation concepts but adds portfolio-level
 * state tracking and compounding.
 *
 * Pure functions — no side effects.
 */

import type { ArbitragePosition } from "../arbitrage/arbitragePositionTypes";
import type { PortfolioReport } from "../arbitrage/portfolioTypes";
import type {
  LiveCapitalManagerConfig,
  CapitalState,
  CapitalDecision,
  CapitalManagerReport,
} from "./capitalManagerTypes";

// ─── Defaults ────────────────────────────────────────────

const DEFAULTS = {
  reserveRatio: 0.1,
  maxUtilizationPercent: 90,
  maxPositionUsd: 50_000,
  minPositionUsd: 1_000,
  maxAllocationPercentPerOpportunity: 0.5,
  compoundProfits: true,
  minAvailableCapitalUsd: 0,
};

function resolveConfig(c: LiveCapitalManagerConfig): Required<LiveCapitalManagerConfig> {
  return {
    totalCapitalUsd: c.totalCapitalUsd,
    reserveRatio: c.reserveRatio ?? DEFAULTS.reserveRatio,
    maxUtilizationPercent: c.maxUtilizationPercent ?? DEFAULTS.maxUtilizationPercent,
    maxPositionUsd: c.maxPositionUsd ?? DEFAULTS.maxPositionUsd,
    minPositionUsd: c.minPositionUsd ?? DEFAULTS.minPositionUsd,
    maxAllocationPercentPerOpportunity: c.maxAllocationPercentPerOpportunity ?? DEFAULTS.maxAllocationPercentPerOpportunity,
    compoundProfits: c.compoundProfits ?? DEFAULTS.compoundProfits,
    minAvailableCapitalUsd: c.minAvailableCapitalUsd ?? DEFAULTS.minAvailableCapitalUsd,
  };
}

// ─── Helpers ─────────────────────────────────────────────

/**
 * Get the allocated capital for a position.
 * Prefers metadata.allocatedCapitalUsd, falls back to max notional.
 */
function getAllocatedCapital(pos: ArbitragePosition): number {
  const fromMetadata = pos.metadata?.allocatedCapitalUsd as number | undefined;
  if (fromMetadata !== undefined && fromMetadata > 0) return fromMetadata;
  return Math.max(pos.spotLeg.notionalUsd, pos.perpetualLeg.notionalUsd);
}

/**
 * Get unrealised PnL from open positions.
 */
function getUnrealizedPnl(pos: ArbitragePosition): number {
  return pos.totalPnlUsd - pos.fundingCollectedUsd;
}

// ─── Public API ──────────────────────────────────────────

/**
 * Calculate the current capital state from open positions, portfolio report, and config.
 *
 * @param openPositions  - Currently open arbitrage positions.
 * @param portfolioReport - Portfolio report (for realised PnL / funding / unrealised).
 * @param config          - Capital manager configuration.
 * @returns A CapitalState snapshot.
 */
export function calculateCapitalState(
  openPositions: ArbitragePosition[],
  portfolioReport: PortfolioReport | undefined,
  config: LiveCapitalManagerConfig,
): CapitalState {
  const cfg = resolveConfig(config);

  // Reserve
  const reserveUsd = cfg.totalCapitalUsd * cfg.reserveRatio;

  // Deployed capital
  let deployedCapitalUsd = 0;
  let unrealizedPnlUsd = 0;

  for (const pos of openPositions) {
    deployedCapitalUsd += getAllocatedCapital(pos);
    unrealizedPnlUsd += getUnrealizedPnl(pos);
  }

  // Realised PnL and funding from portfolio report
  const realizedPnlUsd = portfolioReport?.summary.totalTradingPnlUsd ?? 0;
  const fundingCollectedUsd = portfolioReport?.summary.totalFundingCollectedUsd ?? 0;

  // Available capital
  const availableCapitalUsd = calculateAvailableCapital(
    cfg.totalCapitalUsd,
    reserveUsd,
    deployedCapitalUsd,
    realizedPnlUsd,
    fundingCollectedUsd,
    cfg.compoundProfits,
  );

  const utilizationPercent = cfg.totalCapitalUsd > 0
    ? (deployedCapitalUsd / cfg.totalCapitalUsd) * 100
    : 0;

  return {
    totalCapitalUsd: cfg.totalCapitalUsd,
    reserveUsd,
    deployedCapitalUsd,
    availableCapitalUsd,
    unrealizedPnlUsd,
    realizedPnlUsd,
    fundingCollectedUsd,
    utilizationPercent,
    updatedAt: Date.now(),
  };
}

/**
 * Calculate available capital for new allocations.
 *
 * If compoundProfits is true, realised PnL and funding are added
 * to the capital base.
 */
export function calculateAvailableCapital(
  totalCapitalUsd: number,
  reserveUsd: number,
  deployedCapitalUsd: number,
  realizedPnlUsd: number,
  fundingCollectedUsd: number,
  compoundProfits: boolean,
): number {
  const profitAdditions = compoundProfits
    ? realizedPnlUsd + fundingCollectedUsd
    : 0;

  return totalCapitalUsd + profitAdditions - reserveUsd - deployedCapitalUsd;
}

/**
 * Apply compounding to the total capital base.
 *
 * Returns the new total capital after adding realised profits and funding.
 */
export function applyCompounding(
  totalCapitalUsd: number,
  realizedPnlUsd: number,
  fundingCollectedUsd: number,
  compoundProfits: boolean,
): number {
  if (!compoundProfits) return totalCapitalUsd;
  const profit = realizedPnlUsd + fundingCollectedUsd;
  return totalCapitalUsd + profit;
}

/**
 * Validate a capital allocation decision against constraints.
 *
 * Returns an array of error messages (empty = approved).
 */
export function validateCapitalDecision(
  requestedUsd: number,
  capitalState: CapitalState,
  config: LiveCapitalManagerConfig,
): string[] {
  const errors: string[] = [];
  const cfg = resolveConfig(config);

  // Available capital check
  if (requestedUsd > capitalState.availableCapitalUsd) {
    errors.push(`Requested $${requestedUsd.toLocaleString()} exceeds available $${capitalState.availableCapitalUsd.toLocaleString()}.`);
  }

  // Max position check
  if (requestedUsd > cfg.maxPositionUsd) {
    errors.push(`Requested $${requestedUsd.toLocaleString()} exceeds max position $${cfg.maxPositionUsd.toLocaleString()}.`);
  }

  // Min position check
  if (requestedUsd < cfg.minPositionUsd) {
    errors.push(`Requested $${requestedUsd.toLocaleString()} is below min position $${cfg.minPositionUsd.toLocaleString()}.`);
  }

  // Utilisation check (projected)
  const projectedUtilization = ((capitalState.deployedCapitalUsd + requestedUsd) / cfg.totalCapitalUsd) * 100;
  if (projectedUtilization > cfg.maxUtilizationPercent) {
    errors.push(`Projected utilisation ${projectedUtilization.toFixed(1)}% exceeds max ${cfg.maxUtilizationPercent}%.`);
  }

  // Max allocation % of total capital
  const maxByPercent = cfg.totalCapitalUsd * cfg.maxAllocationPercentPerOpportunity;
  if (requestedUsd > maxByPercent) {
    errors.push(`Requested $${requestedUsd.toLocaleString()} exceeds ${cfg.maxAllocationPercentPerOpportunity * 100}% of total capital ($${maxByPercent.toLocaleString()}).`);
  }

  // Min available check
  if (cfg.minAvailableCapitalUsd > 0) {
    const remainingAfter = capitalState.availableCapitalUsd - requestedUsd;
    if (remainingAfter < cfg.minAvailableCapitalUsd) {
      errors.push(`Allocation would leave only $${remainingAfter.toLocaleString()} available, below minimum $${cfg.minAvailableCapitalUsd.toLocaleString()}.`);
    }
  }

  return errors;
}

/**
 * Generate capital decisions for a set of allocation requests.
 *
 * Each request is checked against current capital state and config.
 *
 * @param requests  - Array of { opportunityId, symbol, requestedUsd }.
 * @param capitalState - Current capital state.
 * @param config    - Capital manager configuration.
 * @returns Array of CapitalDecision.
 */
export function generateCapitalDecisions(
  requests: Array<{ opportunityId: string; symbol: string; requestedUsd: number }>,
  capitalState: CapitalState,
  config: LiveCapitalManagerConfig,
): CapitalDecision[] {
  const cfg = resolveConfig(config);
  let remainingAvailable = capitalState.availableCapitalUsd;
  let deployedSoFar = capitalState.deployedCapitalUsd;

  return requests.map((req) => {
    // Build a temporary capital state for this allocation
    const tempState: CapitalState = {
      ...capitalState,
      availableCapitalUsd: remainingAvailable,
      deployedCapitalUsd: deployedSoFar,
    };

    const errors = validateCapitalDecision(req.requestedUsd, tempState, cfg);

    if (errors.length > 0) {
      return {
        opportunityId: req.opportunityId,
        symbol: req.symbol,
        approved: false,
        allocatedUsd: 0,
        reason: errors.join("; "),
        projectedUtilizationPercent: ((deployedSoFar) / cfg.totalCapitalUsd) * 100,
      };
    }

    // Approve
    deployedSoFar += req.requestedUsd;
    remainingAvailable -= req.requestedUsd;

    return {
      opportunityId: req.opportunityId,
      symbol: req.symbol,
      approved: true,
      allocatedUsd: req.requestedUsd,
      reason: "Allocation approved.",
      projectedUtilizationPercent: (deployedSoFar / cfg.totalCapitalUsd) * 100,
    };
  });
}

/**
 * Generate a full capital manager report.
 *
 * @param openPositions  - Currently open positions.
 * @param portfolioReport - Portfolio report from Alpha-7.
 * @param allocationRequests - Requests for new allocations.
 * @param config           - Capital manager configuration.
 * @returns A CapitalManagerReport.
 */
export function generateCapitalManagerReport(
  openPositions: ArbitragePosition[],
  portfolioReport: PortfolioReport | undefined,
  allocationRequests: Array<{ opportunityId: string; symbol: string; requestedUsd: number }>,
  config: LiveCapitalManagerConfig,
): CapitalManagerReport {
  const capitalState = calculateCapitalState(openPositions, portfolioReport, config);
  const decisions = generateCapitalDecisions(allocationRequests, capitalState, config);

  let approvedCount = 0;
  let rejectedCount = 0;

  for (const d of decisions) {
    if (d.approved) approvedCount++;
    else rejectedCount++;
  }

  return {
    capitalState,
    decisions,
    approvedCount,
    rejectedCount,
    generatedAt: Date.now(),
  };
}
