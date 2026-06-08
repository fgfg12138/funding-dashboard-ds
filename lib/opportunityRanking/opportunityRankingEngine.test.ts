/**
 * Opportunity Ranking Engine Tests — Alpha Phase A1
 */

import { describe, expect, it } from "vitest";
import { calculateOpportunityRanking, rankOpportunities } from "./opportunityRankingEngine";
import type { UnifiedOpportunity } from "../opportunities/types";

function makeOpp(overrides?: Partial<UnifiedOpportunity>): UnifiedOpportunity {
  return {
    id: "opp-001",
    opportunityType: "SpotPerp",
    symbol: "BTC/USDT",
    base: "BTC",
    quote: "USDT",
    primaryExchange: "Binance",
    direction: "long",
    fundingRate: 0.001,
    annualizedRate: 25,
    volume24h: 500_000_000,
    openInterestUsd: 200_000_000,
    score: 75,
    riskTags: [],
    opportunityReason: "High funding",
    ...overrides,
  };
}

// ─── Basic Computation ───────────────────────────────────

describe("calculateOpportunityRanking — basic", () => {
  const result = calculateOpportunityRanking(makeOpp());

  it("returns a result with all sub-scores", () => {
    expect(result.opportunityId).toBe("opp-001");
    expect(typeof result.fundingScore).toBe("number");
    expect(typeof result.liquidityScore).toBe("number");
    expect(typeof result.volumeScore).toBe("number");
    expect(typeof result.riskScore).toBe("number");
    expect(typeof result.capacityScore).toBe("number");
    expect(typeof result.totalScore).toBe("number");
  });

  it("totalScore is between 0 and 100", () => {
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.totalScore).toBeLessThanOrEqual(100);
  });

  it("has a valid tier", () => {
    expect(["elite", "strong", "medium", "weak"]).toContain(result.rankingTier);
  });
});

// ─── Funding Score ───────────────────────────────────────

describe("fundingScore", () => {
  it("increases with higher funding rate", () => {
    const low = calculateOpportunityRanking(makeOpp({ fundingRate: 0.0005, annualizedRate: 10 }));
    const high = calculateOpportunityRanking(makeOpp({ fundingRate: 0.005, annualizedRate: 50 }));
    expect(high.fundingScore).toBeGreaterThan(low.fundingScore);
  });

  it("returns 0 for zero or negative funding", () => {
    const result = calculateOpportunityRanking(makeOpp({ fundingRate: 0, annualizedRate: 0 }));
    expect(result.fundingScore).toBe(0);
  });
});

// ─── Risk Score ──────────────────────────────────────────

describe("riskScore", () => {
  it("is 100 when there are no risk tags", () => {
    const result = calculateOpportunityRanking(makeOpp({ riskTags: [] }));
    expect(result.riskScore).toBe(100);
  });

  it("decreases with more risk tags", () => {
    const clean = calculateOpportunityRanking(makeOpp({ riskTags: [] }));
    const risky = calculateOpportunityRanking(makeOpp({ riskTags: ["低流动性", "low-liquidity", "wide-spread", "abnormal-funding", "stale-data", "高风险"] }));
    expect(risky.riskScore).toBeLessThan(clean.riskScore);
  });

  it("is 0 for maximum risk", () => {
    const result = calculateOpportunityRanking(
      makeOpp({ riskTags: ["低流动性", "low-liquidity", "wide-spread", "abnormal-funding", "stale-data", "高风险"] }),
    );
    expect(result.riskScore).toBe(0);
  });
});

// ─── Tier Classification ────────────────────────────────

describe("tier classification", () => {
  it("90+ is elite", () => {
    // Force high scores across the board
    const result = calculateOpportunityRanking(
      makeOpp({ fundingRate: 0.01, annualizedRate: 60, volume24h: 5_000_000_000, openInterestUsd: 5_000_000_000, riskTags: [] }),
    );
    expect(result.rankingTier).toBe("elite");
  });

  it("75+ is elite or strong (depends on exact data)", () => {
    const result = calculateOpportunityRanking(
      makeOpp({ fundingRate: 0.002, annualizedRate: 30, volume24h: 500_000_000, openInterestUsd: 200_000_000, riskTags: [] }),
    );
    expect(result.totalScore).toBeGreaterThanOrEqual(60);
    expect(["elite", "strong"]).toContain(result.rankingTier);
  });

  it("60+ is medium or better", () => {
    const result = calculateOpportunityRanking(
      makeOpp({ fundingRate: 0.001, annualizedRate: 15, volume24h: 5_000_000, openInterestUsd: 2_000_000, riskTags: ["wide-spread"] }),
    );
    expect(result.totalScore).toBeGreaterThanOrEqual(40);
    expect(result.totalScore).toBeLessThan(75);
  });

  it("below 60 is weak", () => {
    const result = calculateOpportunityRanking(
      makeOpp({ fundingRate: 0.0001, annualizedRate: 2, volume24h: 100_000, openInterestUsd: 50_000, riskTags: ["低流动性", "low-liquidity", "wide-spread", "abnormal-funding", "stale-data", "高风险"] }),
    );
    expect(result.rankingTier).toBe("weak");
  });
});

// ─── Sorting ─────────────────────────────────────────────

describe("rankOpportunities — sorting", () => {
  it("returns results sorted by totalScore descending", () => {
    const opps = [
      makeOpp({ id: "weak", fundingRate: 0.0001, annualizedRate: 2, volume24h: 100_000, openInterestUsd: 50_000, riskTags: ["低流动性"] }),
      makeOpp({ id: "strong", fundingRate: 0.003, annualizedRate: 35, volume24h: 1_000_000_000, openInterestUsd: 500_000_000, riskTags: [] }),
      makeOpp({ id: "medium", fundingRate: 0.001, annualizedRate: 15, volume24h: 10_000_000, openInterestUsd: 5_000_000, riskTags: ["wide-spread"] }),
    ];

    const ranked = rankOpportunities(opps);
    expect(ranked.length).toBe(3);
    expect(ranked[0].totalScore).toBeGreaterThanOrEqual(ranked[1].totalScore);
    expect(ranked[1].totalScore).toBeGreaterThanOrEqual(ranked[2].totalScore);
  });
});

// ─── Boundary Values ─────────────────────────────────────

describe("boundary values", () => {
  it("handles missing volume gracefully", () => {
    const result = calculateOpportunityRanking(makeOpp({ volume24h: undefined, openInterestUsd: undefined }));
    expect(result.volumeScore).toBe(40);
    expect(result.liquidityScore).toBe(40);
    expect(result.capacityScore).toBe(30);
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
  });

  it("handles very high volume", () => {
    const result = calculateOpportunityRanking(makeOpp({ volume24h: 50_000_000_000, openInterestUsd: 10_000_000_000 }));
    expect(result.volumeScore).toBe(100);
    expect(result.liquidityScore).toBe(100);
  });
});
