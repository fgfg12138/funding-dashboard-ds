/**
 * Net Profit Engine Tests — Alpha Phase A2
 *
 * Acceptance criteria:
 *   Funding APY = 40%, Fee = 2%, Slippage = 1%, Borrow = 5%, Capital Cost = 3%
 *   → Net APY = 29%
 */

import { describe, expect, it } from "vitest";
import { calculateNetProfit, calculateOpportunityNetProfit } from "./netProfitEngine";
import type { UnifiedOpportunity } from "../opportunities/types";

// ─── Helper ──────────────────────────────────────────────

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
    annualizedRate: 40,
    volume24h: 500_000_000,
    openInterestUsd: 200_000_000,
    score: 75,
    riskTags: [],
    opportunityReason: "High funding",
    ...overrides,
  };
}

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  it("Funding APY=40, Fee=2, Slippage=1, Borrow=5, Capital=3 → Net APY=29", () => {
    const result = calculateNetProfit(40, {
      feeCostPercent: 2,
      slippageCostPercent: 1,
      borrowRateAnnualPercent: 5,
      capitalCostAnnualPercent: 3,
    });

    expect(result.fundingApy).toBe(40);
    expect(result.feeCostPercent).toBe(2);
    expect(result.slippageCostPercent).toBe(1);
    expect(result.borrowCostPercent).toBe(5);
    expect(result.capitalCostPercent).toBe(3);
    expect(result.netApy).toBe(29);
  });

  it("verify netProfitUsd for 29% APY on $1,000 position", () => {
    const result = calculateNetProfit(40, {
      feeCostPercent: 2,
      slippageCostPercent: 1,
      borrowRateAnnualPercent: 5,
      capitalCostAnnualPercent: 3,
      positionSizeUsd: 1_000,
    });
    // 29% of $1,000 = $290
    expect(result.netProfitUsd).toBe(290);
  });

  it("acceptance with custom position size", () => {
    const result = calculateNetProfit(40, {
      feeCostPercent: 2,
      slippageCostPercent: 1,
      borrowRateAnnualPercent: 5,
      capitalCostAnnualPercent: 3,
      positionSizeUsd: 10_000,
    });
    // 29% of $10,000 = $2,900
    expect(result.netProfitUsd).toBe(2900);
  });
});

// ─── Defaults ────────────────────────────────────────────

describe("default values", () => {
  it("uses default costs when no config provided", () => {
    const result = calculateNetProfit(40);
    // Defaults: fee=2, slippage=1, borrow=5, capital=3
    expect(result.feeCostPercent).toBe(2);
    expect(result.slippageCostPercent).toBe(1);
    expect(result.borrowCostPercent).toBe(5);
    expect(result.capitalCostPercent).toBe(3);
    // 40 - 2 - 1 - 5 - 3 = 29
    expect(result.netApy).toBe(29);
  });

  it("uses default position size of $1,000", () => {
    const result = calculateNetProfit(40);
    expect(result.netProfitUsd).toBe(290);
  });

  it("overrides individual cost parameters", () => {
    const result = calculateNetProfit(40, {
      feeCostPercent: 0.5,
      borrowRateAnnualPercent: 2,
    });
    // 40 - 0.5 - 1 - 2 - 3 = 33.5
    expect(result.netApy).toBe(33.5);
    expect(result.feeCostPercent).toBe(0.5);
    expect(result.slippageCostPercent).toBe(1); // default
    expect(result.borrowCostPercent).toBe(2);
    expect(result.capitalCostPercent).toBe(3); // default
  });
});

// ─── Edge Cases ──────────────────────────────────────────

describe("edge cases", () => {
  it("netApy is floored at 0 (costs exceed funding)", () => {
    const result = calculateNetProfit(5, {
      feeCostPercent: 2,
      slippageCostPercent: 1,
      borrowRateAnnualPercent: 5,
      capitalCostAnnualPercent: 3,
    });
    // 5 - 2 - 1 - 5 - 3 = -6 → 0
    expect(result.netApy).toBe(0);
  });

  it("zero funding yields zero netApy", () => {
    const result = calculateNetProfit(0);
    expect(result.netApy).toBe(0);
  });

  it("zero costs yields full funding APY", () => {
    const result = calculateNetProfit(40, {
      feeCostPercent: 0,
      slippageCostPercent: 0,
      borrowRateAnnualPercent: 0,
      capitalCostAnnualPercent: 0,
    });
    expect(result.netApy).toBe(40);
  });

  it("works with very high funding APY", () => {
    const result = calculateNetProfit(200, {
      feeCostPercent: 2,
      slippageCostPercent: 1,
      borrowRateAnnualPercent: 5,
      capitalCostAnnualPercent: 3,
    });
    // 200 - 2 - 1 - 5 - 3 = 189
    expect(result.netApy).toBe(189);
  });
});

// ─── Opportunity Integration ─────────────────────────────

describe("calculateOpportunityNetProfit", () => {
  it("extracts annualizedRate from opportunity", () => {
    const result = calculateOpportunityNetProfit(makeOpp({ annualizedRate: 40 }));
    expect(result.fundingApy).toBe(40);
    expect(result.netApy).toBe(29);
  });

  it("passes cost config through", () => {
    const result = calculateOpportunityNetProfit(
      makeOpp({ annualizedRate: 50 }),
      { feeCostPercent: 1, slippageCostPercent: 0.5 },
    );
    // 50 - 1 - 0.5 - 5 - 3 = 40.5
    expect(result.netApy).toBe(40.5);
  });

  it("handles zero annualizedRate", () => {
    const result = calculateOpportunityNetProfit(makeOpp({ annualizedRate: 0 }));
    expect(result.netApy).toBe(0);
  });
});
