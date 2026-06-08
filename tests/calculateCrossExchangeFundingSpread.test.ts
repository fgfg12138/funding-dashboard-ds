import { describe, expect, it } from "vitest";
import { calculateCrossExchangeFundingSpread } from "../lib/arbitrage/calculations";
import type { FundingMarket } from "../lib/exchanges/types";

const missingOi = "\u6301\u4ed3\u91cf\u7f3a\u5931";
const wideSpread = "\u4ef7\u5dee\u8fc7\u5927";
const nearSettlement = "\u7ed3\u7b97\u4e34\u8fd1";

const market = (
  exchange: FundingMarket["exchange"],
  fundingRate: number,
  markPrice: number,
  extra: Partial<FundingMarket> = {}
): FundingMarket => ({
  exchange,
  rawSymbol: `${exchange}-BTCUSDT`,
  symbol: "BTC/USDT",
  base: "BTC",
  quote: "USDT",
  fundingRate,
  fundingIntervalHours: 8,
  nextFundingTime: Date.now() + 10 * 60_000,
  markPrice,
  volume24h: 2_000_000,
  ...extra
});

describe("calculateCrossExchangeFundingSpread", () => {
  it("adds score, risk tags, exchange count, and price direction", () => {
    const opportunity = calculateCrossExchangeFundingSpread("BTC/USDT", [
      market("Binance", -0.0001, 100_000, { openInterestUsd: 100_000_000 }),
      market("Bybit", 0.0003, 99_000),
      market("OKX", 0.00005, 101_000, { openInterestUsd: 50_000_000 })
    ]);

    expect(opportunity).toMatchObject({
      shortExchange: "Bybit",
      longExchange: "Binance",
      exchangeCount: 3
    });
    expect(opportunity?.priceSpread).toBeCloseTo(-1, 4);
    expect(opportunity?.priceSpreadDirection).toContain("Bybit");
    expect(opportunity?.opportunityReason).toContain("Bybit \u5e74\u5316\u9ad8\u4e8e Binance");
    expect(opportunity?.opportunityReason).toContain("\u65b9\u5411\u4e3a\u7a7a Bybit / \u591a Binance");
    expect(opportunity?.opportunityReason).toContain("24h\u6210\u4ea4\u91cf\u5145\u8db3");
    expect(opportunity?.score).toBeGreaterThanOrEqual(0);
    expect(opportunity?.score).toBeLessThanOrEqual(100);
    expect(opportunity?.riskTags).toEqual(expect.arrayContaining([missingOi, wideSpread, nearSettlement]));
  });
});
