/**
 * Opportunity Ranking Engine — Alpha Phase A1
 *
 * Pure ranking layer that computes a 0-100 totalScore and tier
 * (elite / strong / medium / weak) for each opportunity.
 *
 * Does NOT modify existing scoring or discovery logic.
 */

import type { UnifiedOpportunity } from "../opportunities/types";
import type {
  OpportunityRankingResult,
  OpportunityRankingTier,
} from "./opportunityRankingTypes";
import type { CostConfig } from "./netProfitTypes";
import { calculateOpportunityNetProfit } from "./netProfitEngine";

// ─── Weights ─────────────────────────────────────────────

const W_FUNDING = 0.30;
const W_LIQUIDITY = 0.20;
const W_VOLUME = 0.15;
const W_RISK = 0.20;
const W_CAPACITY = 0.15;

// ─── Tier Thresholds ─────────────────────────────────────

function getTier(totalScore: number): OpportunityRankingTier {
  if (totalScore >= 90) return "elite";
  if (totalScore >= 75) return "strong";
  if (totalScore >= 60) return "medium";
  return "weak";
}

// ─── Sub-Scores ──────────────────────────────────────────

/**
 * Funding score (0-100).
 *
 * Uses annualizedRate as a proxy for funding quality when fundingRate is absent.
 * Higher funding → higher score.
 * Score baseline: annualizedRate 0% → 0, 30% → 50, 60%+ → 100.
 */
function calcFundingScore(opp: UnifiedOpportunity): number {
  const rate = opp.fundingRate !== undefined
    ? Math.abs(opp.fundingRate) * 100 * 365 // approximate implied annualized from per-period rate
    : opp.annualizedRate;

  if (rate <= 0) return 0;
  const capped = Math.min(rate, 60);
  return Math.round((capped / 60) * 100);
}

/**
 * Liquidity score (0-100).
 *
 * Based on open interest. Higher OI → deeper liquidity → higher score.
 * Missing OI defaults to a neutral score.
 */
function calcLiquidityScore(opp: UnifiedOpportunity): number {
  const oi = opp.openInterestUsd;
  if (oi === undefined || oi === null) return 40;

  if (oi >= 1_000_000_000) return 100;
  if (oi >= 100_000_000) return 85;
  if (oi >= 10_000_000) return 65;
  if (oi >= 1_000_000) return 45;
  return 25;
}

/**
 * Volume score (0-100).
 *
 * Based on 24h volume. Higher volume → higher score.
 */
function calcVolumeScore(opp: UnifiedOpportunity): number {
  const vol = opp.volume24h;
  if (vol === undefined || vol === null) return 40;

  if (vol >= 1_000_000_000) return 100;
  if (vol >= 100_000_000) return 85;
  if (vol >= 10_000_000) return 65;
  if (vol >= 1_000_000) return 45;
  return 20;
}

/**
 * Risk score (0-100).
 *
 * Inverted from risk tags — lower actual risk → higher score.
 * No risk tags → 100. Each tag reduces the score.
 */
function calcRiskScore(opp: UnifiedOpportunity): number {
  const penalties: Record<string, number> = {
    "低流动性": 20,
    "low-liquidity": 20,
    "wide-spread": 15,
    "wide-spread-bps": 15,
    "abnormal-funding": 18,
    "stale-data": 12,
    "高风险": 15,
    "基础差": 10,
  };

  let totalPenalty = 0;
  for (const tag of opp.riskTags) {
    totalPenalty += penalties[tag] ?? 5;
  }

  const score = Math.max(0, 100 - totalPenalty);
  return score;
}

/**
 * Capacity score (0-100).
 *
 * Combines volume and OI into a single capacity metric.
 */
function calcCapacityScore(opp: UnifiedOpportunity): number {
  const vol = opp.volume24h;
  const oi = opp.openInterestUsd;

  const volScore = vol !== undefined && vol !== null
    ? Math.min(100, (vol / 500_000_000) * 100)
    : 0;

  const oiScore = oi !== undefined && oi !== null
    ? Math.min(100, (oi / 500_000_000) * 100)
    : 0;

  const count = (vol !== undefined && vol !== null ? 1 : 0)
             + (oi !== undefined && oi !== null ? 1 : 0);

  if (count === 0) return 30;

  return Math.round((volScore + oiScore) / count);
}

// ─── Public API ──────────────────────────────────────────

/**
 * Compute ranking for a single opportunity.
 *
 * When a costConfig is provided, the result also includes
 * expectedNetApy, netProfitUsd, and cost breakdown fields.
 *
 * @param opp        - A unified opportunity with score, volume, OI, risk tags.
 * @param costConfig - Optional cost parameters for net profit estimation.
 * @returns An OpportunityRankingResult with sub-scores, total, tier, and optional net profit.
 */
export function calculateOpportunityRanking(
  opp: UnifiedOpportunity,
  costConfig?: CostConfig,
): OpportunityRankingResult {
  const fundingScore = calcFundingScore(opp);
  const liquidityScore = calcLiquidityScore(opp);
  const volumeScore = calcVolumeScore(opp);
  const riskScore = calcRiskScore(opp);
  const capacityScore = calcCapacityScore(opp);

  const totalScore = Math.round(
    fundingScore * W_FUNDING +
    liquidityScore * W_LIQUIDITY +
    volumeScore * W_VOLUME +
    riskScore * W_RISK +
    capacityScore * W_CAPACITY
  );

  const clamped = Math.max(0, Math.min(100, totalScore));

  const base: OpportunityRankingResult = {
    opportunityId: opp.id,
    symbol: opp.symbol,
    fundingScore,
    liquidityScore,
    volumeScore,
    riskScore,
    capacityScore,
    totalScore: clamped,
    rankingTier: getTier(clamped),
  };

  // Alpha A2: attach net profit breakdown when cost config is provided
  if (costConfig) {
    const np = calculateOpportunityNetProfit(opp, costConfig);
    base.expectedNetApy = np.netApy;
    base.netProfitUsd = np.netProfitUsd;
    base.feeCost = np.feeCostPercent;
    base.slippageCost = np.slippageCostPercent;
    base.borrowCost = np.borrowCostPercent;
    base.capitalCost = np.capitalCostPercent;
  }

  return base;
}

/**
 * Rank multiple opportunities, sorted by priority descending.
 *
 * When net profit data is available (costConfig provided),
 * sorting uses expectedNetApy (higher first) instead of totalScore.
 *
 * @param opportunities - Array of unified opportunities.
 * @param costConfig    - Optional cost parameters for net profit estimation.
 * @returns Array of ranking results sorted best-first.
 */
export function rankOpportunities(
  opportunities: UnifiedOpportunity[],
  costConfig?: CostConfig,
): OpportunityRankingResult[] {
  const ranked = opportunities.map((opp) => calculateOpportunityRanking(opp, costConfig));

  if (costConfig && ranked.some((r) => r.expectedNetApy !== undefined)) {
    // Sort by expectedNetApy descending; fall back to totalScore when equal
    ranked.sort((a, b) => (b.expectedNetApy ?? b.totalScore) - (a.expectedNetApy ?? a.totalScore));
  } else {
    ranked.sort((a, b) => b.totalScore - a.totalScore);
  }

  return ranked;
}
