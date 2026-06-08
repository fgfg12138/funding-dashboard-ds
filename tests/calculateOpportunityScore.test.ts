import { describe, expect, it } from "vitest";
import { calculateOpportunityScore } from "../lib/arbitrage/calculations";

const baseInput = {
  volume24h: 100_000_000,
  openInterestUsd: 100_000_000,
  priceSpread: 0,
  exchangeCount: 3,
  nextFundingTime: Date.now() + 2 * 60 * 60_000
};

describe("calculateOpportunityScore", () => {
  it("uses segmented annualized scoring instead of maxing out above 50 percent", () => {
    const rate50 = calculateOpportunityScore({ ...baseInput, annualizedRate: 50 });
    const rate120 = calculateOpportunityScore({ ...baseInput, annualizedRate: 120 });
    const rate300 = calculateOpportunityScore({ ...baseInput, annualizedRate: 300 });

    expect(rate50).toBeLessThan(rate120);
    expect(rate120).toBeLessThan(rate300);
    expect(rate50).toBeLessThan(90);
  });
});
