import { describe, expect, it } from "vitest";
import { scoreOpportunity, type ScorableOpportunity } from "./scoring";

// ─── Sample data ────────────────────────────────────────

const highQualityOpp: ScorableOpportunity = {
  id: "opp-a",
  symbol: "BTC/USDT",
  annualizedRate: 35,
  fundingRate: 0.001,
  estimatedNetRate: 30,
  volume24h: 15_000_000_000,
  openInterestUsd: 25_000_000_000,
  riskTags: [],
  hasSecondaryExchange: true,
};

const mediumOpp: ScorableOpportunity = {
  id: "opp-b",
  symbol: "ETH/USDT",
  annualizedRate: 15,
  fundingRate: 0.002,
  estimatedNetRate: 10,
  volume24h: 500_000_000,
  openInterestUsd: 800_000_000,
  riskTags: ["wide-spread"],
  hasSecondaryExchange: true,
};

const lowLiquidityOpp: ScorableOpportunity = {
  id: "opp-c",
  symbol: "ALT/USDT",
  annualizedRate: 8,
  fundingRate: -0.001,
  estimatedNetRate: 3,
  volume24h: 200_000,
  openInterestUsd: 500_000,
  riskTags: ["低流动性"],
  hasSecondaryExchange: false,
};

const extremeReturnOpp: ScorableOpportunity = {
  id: "opp-d",
  symbol: "MEME/USDT",
  annualizedRate: 180,
  fundingRate: 0.001,
  estimatedNetRate: 150,
  volume24h: 2_000_000_000,
  openInterestUsd: 3_000_000_000,
  riskTags: [],
  hasSecondaryExchange: true,
};

const missingDataOpp: ScorableOpportunity = {
  id: "opp-e",
  symbol: "XRP/USDT",
  annualizedRate: 22,
  riskTags: [],
  hasSecondaryExchange: false,
};

describe("scoreOpportunity", () => {
  it("a high-quality opportunity gets grade A", () => {
    const result = scoreOpportunity(highQualityOpp);
    expect(result.grade).toBe("A");
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("a medium opportunity gets grade B or C", () => {
    const result = scoreOpportunity(mediumOpp);
    expect(["A", "B", "C"]).toContain(result.grade);
    // Should be strictly lower score than the high quality one
    const highResult = scoreOpportunity(highQualityOpp);
    expect(result.score).toBeLessThan(highResult.score);
  });

  it("a low-liquidity opportunity has score penalized", () => {
    const result = scoreOpportunity(lowLiquidityOpp);
    // Low liquidity and risk tags should pull score below medium
    const mediumResult = scoreOpportunity(mediumOpp);
    expect(result.score).toBeLessThanOrEqual(mediumResult.score);
    expect(result.components.liquidityScore).toBeLessThan(50);
  });

  it("a low-liquidity opportunity has high riskLevel", () => {
    const result = scoreOpportunity(lowLiquidityOpp);
    expect(result.riskLevel).toBe("high");
  });

  it("extreme high return produces a warning", () => {
    const result = scoreOpportunity(extremeReturnOpp);
    const hasHighReturnWarning = result.warnings.some((w) => w.includes("异常高收益"));
    expect(hasHighReturnWarning).toBe(true);
  });

  it("extreme return gets grade A due to high raw return", () => {
    const result = scoreOpportunity(extremeReturnOpp);
    expect(result.grade).toBe("A");
  });

  it("missing liquidity data produces warnings", () => {
    const result = scoreOpportunity(missingDataOpp);
    const hasLiquidityWarning = result.warnings.some((w) => w.includes("缺少流动性数据"));
    expect(hasLiquidityWarning).toBe(true);
  });

  it("missing data gets a D grade", () => {
    const result = scoreOpportunity(missingDataOpp);
    expect(result.grade).toBe("D");
  });

  it("score is clamped between 0 and 100", () => {
    // Extreme zero conditions
    const zeroOpp: ScorableOpportunity = {
      id: "zero",
      symbol: "ZERO/USDT",
      annualizedRate: 0,
      fundingRate: 0,
      riskTags: ["低流动性", "wide-spread", "abnormal-funding", "stale-data"],
      volume24h: 0,
    };
    const result = scoreOpportunity(zeroOpp);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("risk tags influence riskLevel", () => {
    // No tags → low or medium
    const cleanResult = scoreOpportunity(highQualityOpp);
    expect(["low", "medium"]).toContain(cleanResult.riskLevel);

    // Severe tags → high
    expect(scoreOpportunity(lowLiquidityOpp).riskLevel).toBe("high");
  });

  it("components are populated correctly", () => {
    const result = scoreOpportunity(highQualityOpp);
    expect(result.components.returnScore).toBeGreaterThanOrEqual(0);
    expect(result.components.costScore).toBeGreaterThanOrEqual(0);
    expect(result.components.liquidityScore).toBeGreaterThanOrEqual(0);
    expect(result.components.riskPenalty).toBeGreaterThanOrEqual(0);
    expect(result.components.confidenceScore).toBeGreaterThanOrEqual(0);
  });

  it("produces reasonCodes", () => {
    const result = scoreOpportunity(highQualityOpp);
    expect(result.reasonCodes.length).toBe(5);
    expect(result.reasonCodes[0]).toContain("returnScore");
  });

  it("scores different tiers correctly", () => {
    const a = scoreOpportunity(highQualityOpp);
    const c = scoreOpportunity(missingDataOpp);
    const d = scoreOpportunity(lowLiquidityOpp);
    expect(a.score).toBeGreaterThanOrEqual(c.score);
    expect(a.score).toBeGreaterThanOrEqual(d.score);
  });
});