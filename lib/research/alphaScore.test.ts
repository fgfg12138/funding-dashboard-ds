import { describe, expect, it } from "vitest";
import {
  buildAlphaApiPayload,
  buildAlphaDiscovery,
  calculateAlphaScore,
  classifyAlpha,
  gradeAlphaScore
} from "./alphaScore";
import type { FundingFactorSample } from "./fundingFactors";

function sample(overrides: Partial<FundingFactorSample> = {}): FundingFactorSample {
  return {
    id: "cross-exchange:BTC/USDT:Bybit:Binance",
    symbol: "BTC/USDT",
    type: "cross-exchange",
    latestAnnualized: 90,
    avgAnnualized: 70,
    fundingVolatility: 15,
    positiveFundingRatio: 0.95,
    volume24h: 10_000_000,
    openInterestUsd: 20_000_000,
    priceSpread: 0.3,
    score: 80,
    survivalHours: 12,
    annualizedDecay: 8,
    qualityScore: 82,
    ...overrides
  };
}

describe("alpha discovery", () => {
  it("scores stable high-annualized opportunities above risky decaying ones", () => {
    const stableScore = calculateAlphaScore(sample());
    const riskyScore = calculateAlphaScore(
      sample({
        latestAnnualized: 55,
        avgAnnualized: 35,
        positiveFundingRatio: 0.55,
        survivalHours: 2,
        annualizedDecay: 80,
        fundingVolatility: 120,
        qualityScore: 35
      })
    );

    expect(stableScore).toBeGreaterThan(riskyScore);
    expect(stableScore).toBeGreaterThanOrEqual(75);
    expect(stableScore).toBeLessThanOrEqual(100);
  });

  it("assigns alpha grades by score bands", () => {
    expect(gradeAlphaScore(90)).toBe("A+");
    expect(gradeAlphaScore(80)).toBe("A");
    expect(gradeAlphaScore(65)).toBe("B");
    expect(gradeAlphaScore(45)).toBe("C");
    expect(gradeAlphaScore(20)).toBe("D");
  });

  it("classifies alpha types from stability, emergence, momentum, and risk", () => {
    expect(classifyAlpha(sample({ survivalHours: 14, annualizedDecay: 5 }))).toBe("Stable Alpha");
    expect(classifyAlpha(sample({ survivalHours: 1, annualizedDecay: -25, fundingVolatility: 25 }))).toBe("Emerging Alpha");
    expect(classifyAlpha(sample({ positiveFundingRatio: 0.96, avgAnnualized: 85, survivalHours: 5, annualizedDecay: 20 }))).toBe("Momentum Alpha");
    expect(classifyAlpha(sample({ fundingVolatility: 110, annualizedDecay: 70 }))).toBe("Risky Alpha");
  });

  it("classifies high volatility or high decay as risky alpha", () => {
    expect(classifyAlpha(sample({ fundingVolatility: 90, annualizedDecay: 5 }))).toBe("Risky Alpha");
    expect(classifyAlpha(sample({ fundingVolatility: 20, annualizedDecay: 55 }))).toBe("Risky Alpha");
  });

  it("keeps emerging alpha based on negative annualized decay", () => {
    expect(classifyAlpha(sample({ survivalHours: 1, annualizedDecay: -10, fundingVolatility: 79 }))).toBe("Emerging Alpha");
  });

  it("sorts top alpha and type-specific lists by alpha score", () => {
    const discovery = buildAlphaDiscovery({
      samples: [
        sample({ symbol: "LOW/USDT", latestAnnualized: 25, avgAnnualized: 20, qualityScore: 40 }),
        sample({ symbol: "HIGH/USDT", latestAnnualized: 120, avgAnnualized: 90, qualityScore: 92 }),
        sample({ symbol: "MID/USDT", latestAnnualized: 70, avgAnnualized: 55, qualityScore: 70 })
      ],
      limit: 2
    });

    expect(discovery.topAlpha.map((row) => row.symbol)).toEqual(["HIGH/USDT", "MID/USDT"]);
    expect(discovery.topStableAlpha.length).toBeLessThanOrEqual(2);
  });

  it("filters alpha API by type, minimum score, and limit", async () => {
    const payload = buildAlphaApiPayload(
      [
        sample({ symbol: "KEEP/USDT", latestAnnualized: 120, avgAnnualized: 90, qualityScore: 95 }),
        sample({ symbol: "DROP/USDT", latestAnnualized: 20, avgAnnualized: 15, qualityScore: 30 }),
        sample({ symbol: "RISK/USDT", fundingVolatility: 120, annualizedDecay: 70, qualityScore: 85 })
      ],
      new URLSearchParams("type=Stable%20Alpha&minAlphaScore=80&limit=1")
    );

    expect(payload.topAlpha).toHaveLength(1);
    expect(payload.topAlpha[0]).toMatchObject({
      symbol: "KEEP/USDT",
      alphaType: "Stable Alpha"
    });
  });
});
