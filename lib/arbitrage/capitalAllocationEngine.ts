/**
 * Capital Allocation Engine — Alpha Phase A6
 *
 * Distributes a pool of capital across eligible arbitrage opportunities
 * based on expected net APY, opportunity score, and risk score.
 *
 * Pure functions — no side effects.
 */

import type {
  CapitalAllocation,
  CapitalAllocationConfig,
  CapitalAllocationInput,
  CapitalAllocationOpportunity,
  CapitalAllocationResult,
  SkippedAllocation,
} from "./capitalAllocationTypes";

// ─── Defaults ────────────────────────────────────────────

const DEFAULT_RESERVE_RATIO = 0.1;
const DEFAULT_MAX_POSITION_USD = 50_000;
const DEFAULT_MIN_POSITION_USD = 1_000;
const DEFAULT_MAX_ALLOC_PERCENT = 0.5; // 50 %
const DEFAULT_MIN_NET_APY = 8;
const DEFAULT_NET_APY_WEIGHT = 0.6;
const DEFAULT_SCORE_WEIGHT = 0.3;
const DEFAULT_RISK_WEIGHT = 0.1;

// ─── Internal helpers ───────────────────────────────────

function resolveConfig(config?: CapitalAllocationConfig): Required<CapitalAllocationConfig> {
  return {
    maxPositionUsd: config?.maxPositionUsd ?? DEFAULT_MAX_POSITION_USD,
    minPositionUsd: config?.minPositionUsd ?? DEFAULT_MIN_POSITION_USD,
    maxAllocationPercentPerOpportunity: config?.maxAllocationPercentPerOpportunity ?? DEFAULT_MAX_ALLOC_PERCENT,
    minExpectedNetApy: config?.minExpectedNetApy ?? DEFAULT_MIN_NET_APY,
    maxRiskScore: config?.maxRiskScore ?? 999, // effectively unbounded
    reserveRatio: config?.reserveRatio ?? DEFAULT_RESERVE_RATIO,
    netApyWeight: config?.netApyWeight ?? DEFAULT_NET_APY_WEIGHT,
    scoreWeight: config?.scoreWeight ?? DEFAULT_SCORE_WEIGHT,
    riskWeight: config?.riskWeight ?? DEFAULT_RISK_WEIGHT,
  };
}

// ─── Public API ──────────────────────────────────────────

/**
 * Filter opportunities that are eligible for capital allocation.
 *
 * An opportunity is skipped if any of:
 * - shouldExit === true
 * - expectedNetApy < minExpectedNetApy
 * - riskScore > maxRiskScore (when defined)
 * - capacityUsd exists and <= 0
 *
 * Returns the filtered list and a list of skipped opportunities with reasons.
 */
export function filterEligibleOpportunities(
  opportunities: CapitalAllocationOpportunity[],
  config: Required<CapitalAllocationConfig>,
): {
  eligible: CapitalAllocationOpportunity[];
  skipped: SkippedAllocation[];
} {
  const eligible: CapitalAllocationOpportunity[] = [];
  const skipped: SkippedAllocation[] = [];

  for (const opp of opportunities) {
    if (opp.shouldExit) {
      skipped.push({ opportunityId: opp.id, symbol: opp.symbol, reason: "退出信号 (shouldExit)" });
      continue;
    }
    if (opp.expectedNetApy < config.minExpectedNetApy) {
      skipped.push({ opportunityId: opp.id, symbol: opp.symbol, reason: `预期净年化 ${opp.expectedNetApy}% 低于最低要求 ${config.minExpectedNetApy}%` });
      continue;
    }
    if (opp.riskScore !== undefined && opp.riskScore > config.maxRiskScore) {
      skipped.push({ opportunityId: opp.id, symbol: opp.symbol, reason: `风险评分 ${opp.riskScore} 超过上限 ${config.maxRiskScore}` });
      continue;
    }
    if (opp.capacityUsd !== undefined && opp.capacityUsd <= 0) {
      skipped.push({ opportunityId: opp.id, symbol: opp.symbol, reason: `容量不足 (${opp.capacityUsd})` });
      continue;
    }
    eligible.push(opp);
  }

  return { eligible, skipped };
}

/**
 * Calculate a raw allocation weight for a single opportunity.
 *
 * weight = expectedNetApy * netApyWeight
 *        + opportunityScore * scoreWeight
 *        - riskScore * riskWeight
 *
 * Minimum weight is 0.
 */
export function calculateAllocationWeight(
  opportunity: CapitalAllocationOpportunity,
  config: Required<CapitalAllocationConfig>,
): number {
  const netApyScore = (opportunity.expectedNetApy ?? 0) * config.netApyWeight;
  const scoreScore = (opportunity.opportunityScore ?? 0) * config.scoreWeight;
  const riskScore = (opportunity.riskScore ?? 0) * config.riskWeight;

  const weight = netApyScore + scoreScore - riskScore;
  return Math.max(0, weight);
}

/**
 * Normalise weights so they sum to 1, returning each opportunity's fraction.
 */
export function normalizeAllocationWeights(
  opportunities: CapitalAllocationOpportunity[],
  config: Required<CapitalAllocationConfig>,
): Array<{ opportunity: CapitalAllocationOpportunity; weight: number; normalizedWeight: number }> {
  const weighted = opportunities.map((opp) => ({
    opportunity: opp,
    weight: calculateAllocationWeight(opp, config),
  }));

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);

  if (totalWeight <= 0) {
    return weighted.map((w) => ({ ...w, normalizedWeight: 0 }));
  }

  return weighted.map((w) => ({
    ...w,
    normalizedWeight: w.weight / totalWeight,
  }));
}

/**
 * Clamp an allocation value to all applicable limits.
 */
function clampAllocation(
  rawUsd: number,
  opportunity: CapitalAllocationOpportunity,
  totalCapitalUsd: number,
  config: Required<CapitalAllocationConfig>,
): number {
  let clamped = rawUsd;

  // Hard per-position cap
  if (clamped > config.maxPositionUsd) {
    clamped = config.maxPositionUsd;
  }

  // Percentage of total capital cap
  const percentCap = totalCapitalUsd * config.maxAllocationPercentPerOpportunity;
  if (clamped > percentCap) {
    clamped = percentCap;
  }

  // Capacity cap
  if (opportunity.capacityUsd !== undefined && clamped > opportunity.capacityUsd) {
    clamped = opportunity.capacityUsd;
  }

  return Math.max(0, clamped);
}

/**
 * Apply allocation limits and return final CapitalAllocation[].
 *
 * Allocations whose clamped value falls below minPositionUsd are
 * converted to skipped.
 */
export function applyAllocationLimits(
  normalized: Array<{ opportunity: CapitalAllocationOpportunity; normalizedWeight: number; }>,
  deployableCapitalUsd: number,
  config: Required<CapitalAllocationConfig>,
  totalCapitalUsd: number,
): {
  allocations: CapitalAllocation[];
  skipped: SkippedAllocation[];
} {
  const allocations: CapitalAllocation[] = [];
  const skipped: SkippedAllocation[] = [];
  let remaining = deployableCapitalUsd;

  // Sort by normalised weight descending to prioritise higher-weight opportunities
  const sorted = [...normalized].sort((a, b) => b.normalizedWeight - a.normalizedWeight);

  for (const item of sorted) {
    if (remaining <= 0) {
      skipped.push({
        opportunityId: item.opportunity.id,
        symbol: item.opportunity.symbol,
        reason: "资金已分配完毕",
      });
      continue;
    }

    const rawUsd = deployableCapitalUsd * item.normalizedWeight;
    const clamped = clampAllocation(rawUsd, item.opportunity, totalCapitalUsd, config);

    if (clamped < config.minPositionUsd) {
      skipped.push({
        opportunityId: item.opportunity.id,
        symbol: item.opportunity.symbol,
        reason: `分配金额 ${Math.round(clamped)} USD 低于最低要求 ${config.minPositionUsd} USD`,
      });
      continue;
    }

    const finalAllocation = Math.min(clamped, remaining);
    allocations.push({
      opportunityId: item.opportunity.id,
      symbol: item.opportunity.symbol,
      allocatedUsd: finalAllocation,
      allocationPercent: deployableCapitalUsd > 0 ? (finalAllocation / deployableCapitalUsd) * 100 : 0,
      expectedNetApy: item.opportunity.expectedNetApy,
      expectedAnnualProfitUsd: calculateExpectedAnnualProfit(finalAllocation, item.opportunity.expectedNetApy),
      reason: "按权重分配",
    });

    remaining -= finalAllocation;
  }

  return { allocations, skipped };
}

/**
 * Compute expected annual profit from an allocation.
 *
 * expectedAnnualProfitUsd = allocatedUsd * expectedNetApy / 100
 */
export function calculateExpectedAnnualProfit(
  allocatedUsd: number,
  expectedNetApy: number,
): number {
  return (allocatedUsd * expectedNetApy) / 100;
}

// ─── Main allocator ──────────────────────────────────────

/**
 * Allocate capital across a set of arbitrage opportunities.
 *
 * Steps:
 * 1. Reserve deduction
 * 2. Filter ineligible opportunities
 * 3. Compute weights → normalise
 * 4. Apply limits (maxPositionUsd, percent cap, capacityUsd, minPositionUsd)
 * 5. Build result with utilisation percent
 */
export function allocateCapital(input: CapitalAllocationInput): CapitalAllocationResult {
  const config = resolveConfig(input.config);
  const totalCapitalUsd = input.totalCapitalUsd;
  const reserveRatio = input.reserveRatio ?? config.reserveRatio;

  const reserveUsd = totalCapitalUsd * reserveRatio;
  const deployableCapitalUsd = totalCapitalUsd - reserveUsd;

  // Filter
  const { eligible, skipped: eligibleSkipped } = filterEligibleOpportunities(
    input.opportunities,
    config,
  );

  // Normalise
  const normalized = normalizeAllocationWeights(eligible, config);

  // Apply limits
  const { allocations, skipped: limitSkipped } = applyAllocationLimits(
    normalized,
    deployableCapitalUsd,
    config,
    totalCapitalUsd,
  );

  const totalAllocated = allocations.reduce((sum, a) => sum + a.allocatedUsd, 0);
  const utilizationPercent = deployableCapitalUsd > 0
    ? (totalAllocated / deployableCapitalUsd) * 100
    : 0;

  return {
    totalCapitalUsd,
    reserveUsd,
    deployableCapitalUsd,
    allocations,
    skipped: [...eligibleSkipped, ...limitSkipped],
    utilizationPercent,
  };
}
