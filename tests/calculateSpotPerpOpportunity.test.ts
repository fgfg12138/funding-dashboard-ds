import { describe, expect, it } from "vitest";
import { calculateSpotPerpOpportunity } from "../lib/arbitrage/calculations";
import type { FundingMarket, SpotMarket } from "../lib/exchanges/types";

const spot: SpotMarket = {
  exchange: "Binance",
  symbol: "BTC/USDT",
  base: "BTC",
  quote: "USDT",
  price: 100_000,
  volume24h: 20_000_000
};

const perp: FundingMarket = {
  exchange: "Binance",
  rawSymbol: "BTCUSDT",
  symbol: "BTC/USDT",
  base: "BTC",
  quote: "USDT",
  fundingRate: 0.0002,
  fundingIntervalHours: 8,
  nextFundingTime: Date.now() + 2 * 60 * 60_000,
  markPrice: 100_200,
  volume24h: 30_000_000,
  openInterestUsd: 50_000_000
};

describe("calculateSpotPerpOpportunity", () => {
  it("adds a Chinese opportunity reason", () => {
    const opportunity = calculateSpotPerpOpportunity(spot, perp);

    expect(opportunity?.opportunityReason).toContain("Binance");
    expect(opportunity?.opportunityReason).toContain("\u4e70\u73b0\u8d27");
    expect(opportunity?.opportunityReason).toContain("24h\u6210\u4ea4\u91cf\u5145\u8db3");
    expect(opportunity?.opportunityReason).toContain("\u6301\u4ed3\u91cf\u6b63\u5e38");
  });
});
