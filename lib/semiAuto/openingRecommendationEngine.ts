/**
 * Opening Recommendation Engine — Semi Phase 1
 *
 * Generates human-readable trade opening recommendations by combining
 * opportunity ranking, capital allocation, and risk monitoring outputs.
 *
 * Pure functions — no trading, no execution.
 */

import type { OpportunityRankingResult } from "../opportunityRanking/opportunityRankingTypes";
import type {
  CapitalAllocation,
  CapitalAllocationResult,
} from "../arbitrage/capitalAllocationTypes";
import type { RiskReport } from "../riskMonitoring/riskMonitoringTypes";
import type {
  OpeningRecommendation,
  OpeningRecommendationReport,
  RecommendationStatus,
} from "./openingRecommendationTypes";

// ─── Defaults ────────────────────────────────────────────

const DEFAULT_MIN_NET_APY = 10;
const DEFAULT_MIN_OPPORTUNITY_SCORE = 60;

// ─── Helpers ─────────────────────────────────────────────

let _seq = 0;
function nextId(): string {
  _seq += 1;
  return `rec-${String(_seq).padStart(6, "0")}`;
}

/**
 * Calculate a composite recommendation score (0–100).
 *
 * score = expectedNetApy * 0.5 + opportunityScore * 0.3 + riskAdjustment * 0.2
 *
 * riskAdjustment: 100 - riskScore (higher risk = lower adjustment)
 */
export function calculateRecommendationScore(
  expectedNetApy: number,
  opportunityScore: number,
  riskScore?: number,
): number {
  const netApyPart = expectedNetApy * 0.5;
  const scorePart = opportunityScore * 0.3;
  const riskAdj = riskScore !== undefined ? Math.max(0, 100 - riskScore) * 0.2 : 50 * 0.2;
  return Math.round(Math.max(0, netApyPart + scorePart + riskAdj));
}

/**
 * Build human-readable reasons for a recommendation.
 */
export function buildRecommendationReasons(
  status: RecommendationStatus,
  expectedNetApy: number,
  allocatedCapitalUsd: number,
  overallRisk: string,
  reasons?: string[],
): string[] {
  const result: string[] = [];

  if (status === "recommended") {
    result.push(`Expected Net APY ${expectedNetApy.toFixed(1)}%`);
    result.push(`Risk level: ${overallRisk}`);
    result.push(`Allocated capital ${allocatedCapitalUsd.toLocaleString()} USDT`);
    if (reasons) result.push(...reasons);
  } else if (status === "blocked") {
    if (expectedNetApy < DEFAULT_MIN_NET_APY) {
      result.push(`Expected Net APY ${expectedNetApy.toFixed(1)}% below minimum ${DEFAULT_MIN_NET_APY}%`);
    }
    if (allocatedCapitalUsd <= 0) {
      result.push("Capital allocation is zero");
    }
    if (overallRisk === "critical") {
      result.push("Blocked due to critical portfolio risk");
    }
    if (reasons) result.push(...reasons);
  } else {
    result.push("Not recommended based on current parameters");
  }

  return result;
}

/**
 * Evaluate a single opportunity and return an opening recommendation.
 */
export function evaluateRecommendation(
  ranking: OpportunityRankingResult,
  allocation: CapitalAllocation | undefined,
  riskReport: RiskReport,
  config?: { minNetApy?: number; minOpportunityScore?: number },
): OpeningRecommendation {
  const minNetApy = config?.minNetApy ?? DEFAULT_MIN_NET_APY;
  const minScore = config?.minOpportunityScore ?? DEFAULT_MIN_OPPORTUNITY_SCORE;

  const expectedNetApy = ranking.expectedNetApy ?? 0;
  const allocatedUsd = allocation?.allocatedUsd ?? 0;
  const annualProfit = allocation?.expectedAnnualProfitUsd ?? 0;
  const overallRisk = riskReport.overallRisk;

  // Determine status — check ALL block conditions independently
  let status: RecommendationStatus = "recommended";
  const blockReasons: string[] = [];

  if (overallRisk === "critical") {
    status = "blocked";
    blockReasons.push("Blocked due to critical risk");
  }

  if (expectedNetApy < minNetApy) {
    status = "blocked";
    blockReasons.push("low net apy");
  }

  if (allocatedUsd <= 0) {
    status = "blocked";
    blockReasons.push("allocation zero");
  }

  if (status !== "blocked" && ranking.totalScore < minScore) {
    status = "not_recommended";
  }

  const score = calculateRecommendationScore(
    expectedNetApy,
    ranking.totalScore,
    ranking.riskScore,
  );

  const reasons = buildRecommendationReasons(
    status,
    expectedNetApy,
    allocatedUsd,
    overallRisk,
    blockReasons,
  );

  return {
    id: nextId(),
    symbol: ranking.symbol,
    exchange: "default",
    status,
    score,
    expectedNetApy,
    allocatedCapitalUsd: allocatedUsd,
    expectedAnnualProfitUsd: annualProfit,
    riskLevel: overallRisk,
    reasons,
    generatedAt: Date.now(),
  };
}

/**
 * Generate a full opening recommendation report from all available data.
 *
 * @param rankings   - Opportunity ranking results (Alpha-1).
 * @param allocation - Capital allocation result (Alpha-6).
 * @param riskReport - Portfolio risk report (Beta-5).
 * @param config     - Optional thresholds.
 * @returns An OpeningRecommendationReport with all recommendations.
 */
export function generateOpeningRecommendations(
  rankings: OpportunityRankingResult[],
  allocation: CapitalAllocationResult,
  riskReport: RiskReport,
  config?: { minNetApy?: number; minOpportunityScore?: number },
): OpeningRecommendationReport {
  // Index allocations by opportunity ID for fast lookup
  const allocMap = new Map<string, CapitalAllocation>();
  for (const a of allocation.allocations) {
    allocMap.set(a.opportunityId, a);
  }

  const recommendations: OpeningRecommendation[] = [];

  for (const rank of rankings) {
    const alloc = allocMap.get(rank.opportunityId);
    recommendations.push(evaluateRecommendation(rank, alloc, riskReport, config));
  }

  let recommendedCount = 0;
  let blockedCount = 0;

  for (const r of recommendations) {
    if (r.status === "recommended") recommendedCount++;
    else if (r.status === "blocked") blockedCount++;
  }

  return {
    recommendations,
    recommendedCount,
    blockedCount,
    generatedAt: Date.now(),
  };
}
