/**
 * Opening Recommendation Engine Tests — Semi Phase 1
 *
 * Acceptance criteria:
 *   BTC: expectedNetApy=28, opportunityScore=92, allocated=20000,
 *        overallRisk=low → status=recommended
 *   DOGE: expectedNetApy=4, opportunityScore=50, allocated=0,
 *         overallRisk=low → status=blocked (low net apy, allocation zero)
 */

import { describe, expect, it } from "vitest";
import {
  buildRecommendationReasons,
  calculateRecommendationScore,
  evaluateRecommendation,
  generateOpeningRecommendations,
} from "./openingRecommendationEngine";
import type { OpportunityRankingResult } from "../opportunityRanking/opportunityRankingTypes";
import type { CapitalAllocationResult } from "../arbitrage/capitalAllocationTypes";
import type { RiskReport } from "../riskMonitoring/riskMonitoringTypes";

// ─── Helpers ─────────────────────────────────────────────

function makeRanking(overrides?: Partial<OpportunityRankingResult>): OpportunityRankingResult {
  return {
    opportunityId: "opp-btc",
    symbol: "BTC/USDT",
    fundingScore: 80,
    liquidityScore: 75,
    volumeScore: 70,
    riskScore: 20,
    capacityScore: 85,
    totalScore: 80,
    rankingTier: "strong",
    expectedNetApy: 28,
    netProfitUsd: 560,
    feeCost: 2,
    slippageCost: 1,
    borrowCost: 5,
    capitalCost: 3,
    ...overrides,
  };
}

function makeAllocationResult(overrides?: Partial<CapitalAllocationResult>): CapitalAllocationResult {
  return {
    totalCapitalUsd: 100_000,
    reserveUsd: 10_000,
    deployableCapitalUsd: 90_000,
    allocations: [
      {
        opportunityId: "opp-btc",
        symbol: "BTC/USDT",
        allocatedUsd: 20_000,
        allocationPercent: 22.22,
        expectedNetApy: 28,
        expectedAnnualProfitUsd: 5_600,
        reason: "按权重分配",
      },
    ],
    skipped: [],
    utilizationPercent: 22.22,
    ...overrides,
  };
}

function makeRiskReport(overrides?: Partial<RiskReport>): RiskReport {
  return {
    events: [],
    lowCount: 0,
    mediumCount: 0,
    highCount: 0,
    criticalCount: 0,
    overallRisk: "low",
    generatedAt: Date.now(),
    ...overrides,
  };
}

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  it("BTC: recommended when all conditions met", () => {
    const ranking = makeRanking();
    const allocation = makeAllocationResult();
    const risk = makeRiskReport({ overallRisk: "low" });

    const rec = evaluateRecommendation(ranking, allocation.allocations[0], risk);

    expect(rec.status).toBe("recommended");
    expect(rec.symbol).toBe("BTC/USDT");
    expect(rec.score).toBeGreaterThan(0);
    expect(rec.expectedNetApy).toBe(28);
    expect(rec.allocatedCapitalUsd).toBe(20_000);
    expect(rec.reasons.length).toBeGreaterThan(0);
  });

  it("DOGE: blocked when netApy low and allocation zero", () => {
    const ranking = makeRanking({
      opportunityId: "opp-doge",
      symbol: "DOGE/USDT",
      totalScore: 40,
      expectedNetApy: 4,
    });
    const risk = makeRiskReport({ overallRisk: "low" });

    const rec = evaluateRecommendation(ranking, undefined, risk);

    expect(rec.status).toBe("blocked");
    expect(rec.reasons.some((r) => r.includes("low net apy"))).toBe(true);
    expect(rec.reasons.some((r) => r.includes("allocation zero"))).toBe(true);
    expect(rec.allocatedCapitalUsd).toBe(0);
  });
});

// ─── calculateRecommendationScore ───────────────────────

describe("calculateRecommendationScore", () => {
  it("high netApy + high score + low risk → high score", () => {
    const score = calculateRecommendationScore(28, 92, 10);
    // 28*0.5 + 92*0.3 + (100-10)*0.2 = 14 + 27.6 + 18 = 59.6 → 60
    expect(score).toBe(60);
  });

  it("low netApy + low score + high risk → low score", () => {
    const score = calculateRecommendationScore(4, 30, 80);
    // 4*0.5 + 30*0.3 + (100-80)*0.2 = 2 + 9 + 4 = 15
    expect(score).toBe(15);
  });

  it("riskScore undefined uses default 50", () => {
    const score = calculateRecommendationScore(28, 92, undefined);
    // 28*0.5 + 92*0.3 + 50*0.2 = 14 + 27.6 + 10 = 51.6 → 52
    expect(score).toBe(52);
  });
});

// ─── evaluateRecommendation ─────────────────────────────

describe("evaluateRecommendation", () => {
  it("recommended when all conditions pass", () => {
    const ranking = makeRanking();
    const risk = makeRiskReport({ overallRisk: "low" });
    const alloc = makeAllocationResult().allocations[0];

    const rec = evaluateRecommendation(ranking, alloc, risk);
    expect(rec.status).toBe("recommended");
  });

  it("blocked when overallRisk is critical", () => {
    const ranking = makeRanking();
    const risk = makeRiskReport({ overallRisk: "critical" });
    const alloc = makeAllocationResult().allocations[0];

    const rec = evaluateRecommendation(ranking, alloc, risk);
    expect(rec.status).toBe("blocked");
    expect(rec.reasons.some((r) => r.includes("critical risk"))).toBe(true);
  });

  it("blocked when allocation is zero", () => {
    const ranking = makeRanking();
    const risk = makeRiskReport({ overallRisk: "low" });

    const rec = evaluateRecommendation(ranking, undefined, risk);
    expect(rec.status).toBe("blocked");
    expect(rec.reasons.some((r) => r.includes("allocation zero"))).toBe(true);
  });

  it("blocked when netApy below minimum", () => {
    const ranking = makeRanking({ expectedNetApy: 5 });
    const risk = makeRiskReport({ overallRisk: "low" });
    const alloc = makeAllocationResult().allocations[0];

    const rec = evaluateRecommendation(ranking, alloc, risk);
    expect(rec.status).toBe("blocked");
    expect(rec.reasons.some((r) => r.includes("low net apy"))).toBe(true);
  });

  it("not_recommended when score below threshold but no hard block", () => {
    const ranking = makeRanking({ totalScore: 30, expectedNetApy: 15 });
    const risk = makeRiskReport({ overallRisk: "low" });
    const alloc = makeAllocationResult().allocations[0];

    const rec = evaluateRecommendation(ranking, alloc, risk);
    expect(rec.status).toBe("not_recommended");
  });
});

// ─── buildRecommendationReasons ────────────────────────

describe("buildRecommendationReasons", () => {
  it("recommended includes APY, risk, allocation", () => {
    const reasons = buildRecommendationReasons("recommended", 28, 20_000, "low");
    expect(reasons.some((r) => r.includes("28"))).toBe(true);
    expect(reasons.some((r) => r.includes("low"))).toBe(true);
    expect(reasons.some((r) => r.includes("20,000"))).toBe(true);
  });

  it("blocked includes specific block reasons", () => {
    const reasons = buildRecommendationReasons("blocked", 4, 0, "critical");
    expect(reasons.some((r) => r.includes("below minimum"))).toBe(true);
    expect(reasons.some((r) => r.includes("allocation is zero"))).toBe(true);
    expect(reasons.some((r) => r.includes("critical"))).toBe(true);
  });
});

// ─── generateOpeningRecommendations ────────────────────

describe("generateOpeningRecommendations", () => {
  it("mixed report has correct counts", () => {
    // BTC: recommended, DOGE: blocked
    const btcRank = makeRanking();
    const dogeRank = makeRanking({
      opportunityId: "opp-doge",
      symbol: "DOGE/USDT",
      totalScore: 30,
      expectedNetApy: 4,
    });

    const alloc = makeAllocationResult(); // only BTC has allocation
    const risk = makeRiskReport({ overallRisk: "low" });

    const report = generateOpeningRecommendations([btcRank, dogeRank], alloc, risk);

    expect(report.recommendations.length).toBe(2);
    expect(report.recommendedCount).toBe(1);
    expect(report.blockedCount).toBe(1);
  });

  it("report has generatedAt timestamp", () => {
    const ranking = makeRanking();
    const alloc = makeAllocationResult();
    const risk = makeRiskReport();

    const report = generateOpeningRecommendations([ranking], alloc, risk);
    expect(typeof report.generatedAt).toBe("number");
    expect(report.generatedAt).toBeGreaterThan(0);
  });
});

// ─── Immutability ─────────────────────────────────────

describe("immutability", () => {
  it("does not mutate input arrays", () => {
    const rankings = [makeRanking()];
    const alloc = makeAllocationResult();
    const risk = makeRiskReport();
    const len = rankings.length;

    generateOpeningRecommendations(rankings, alloc, risk);
    expect(rankings.length).toBe(len);
  });
});
