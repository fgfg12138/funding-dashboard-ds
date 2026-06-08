import { describe, expect, it } from "vitest";
import { getOpportunityRiskTags } from "../lib/arbitrage/calculations";

const highFunding = "\u9ad8\u8d39\u7387";
const abnormalFunding = "\u5f02\u5e38\u8d39\u7387";

describe("getOpportunityRiskTags", () => {
  it("tags rates above 300 percent as high and abnormal funding", () => {
    const tags = getOpportunityRiskTags({
      annualizedRate: 350,
      volume24h: 10_000_000,
      openInterestUsd: 20_000_000,
      priceSpread: 0.2,
      exchangeCount: 3,
      nextFundingTime: Date.now() + 2 * 60 * 60_000
    });

    expect(tags).toEqual(expect.arrayContaining([highFunding, abnormalFunding]));
  });
});
