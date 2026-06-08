import { describe, expect, it } from "vitest";
import {
  calculateAnnualizedRate,
  calculateCrossExchangeFundingSpread,
  calculateDirectionalPriceSpread,
  calculateOpportunityScore,
  calculateSpotPerpOpportunity,
  getOpportunityRiskTags
} from "./calculations";
import type { FundingMarket, SpotMarket } from "../exchanges/types";

const LOW_LIQUIDITY = "\u4f4e\u6d41\u52a8\u6027";
const MISSING_OPEN_INTEREST = "\u6301\u4ed3\u91cf\u7f3a\u5931";
const WIDE_PRICE_SPREAD = "\u4ef7\u5dee\u8fc7\u5927";
const HIGH_FUNDING_RATE = "\u9ad8\u8d39\u7387";
const ABNORMAL_FUNDING_RATE = "\u5f02\u5e38\u8d39\u7387";
const NEAR_SETTLEMENT = "\u7ed3\u7b97\u4e34\u8fd1";

const nextFundingTime = Date.now() + 2 * 60 * 60_000;

function fundingMarket(
  exchange: FundingMarket["exchange"],
  fundingRate: number,
  markPrice: number,
  extra: Partial<FundingMarket> = {}
): FundingMarket {
  return {
    exchange,
    rawSymbol: `${exchange}-BTCUSDT`,
    symbol: "BTC/USDT",
    base: "BTC",
    quote: "USDT",
    fundingRate,
    fundingIntervalHours: 8,
    nextFundingTime,
    markPrice,
    volume24h: 20_000_000,
    openInterestUsd: 50_000_000,
    ...extra
  };
}

function spotMarket(exchange: SpotMarket["exchange"], price = 100_000): SpotMarket {
  return {
    exchange,
    symbol: "BTC/USDT",
    base: "BTC",
    quote: "USDT",
    price,
    volume24h: 15_000_000
  };
}

describe("calculateAnnualizedRate", () => {
  it("annualizes positive and negative funding by settlement frequency", () => {
    expect(calculateAnnualizedRate(0.0001, 8)).toBeCloseTo(10.95, 4);
    expect(calculateAnnualizedRate(-0.0002, 8)).toBeCloseTo(-21.9, 4);
  });

  it("uses the funding interval without double-counting percent conversion", () => {
    expect(calculateAnnualizedRate(0.0001, 8)).toBeCloseTo(10.95, 4);
    expect(calculateAnnualizedRate(0.0001, 4)).toBeCloseTo(21.9, 4);
    expect(calculateAnnualizedRate(0.0001, 1)).toBeCloseTo(87.6, 4);
  });

  it("returns zero for invalid intervals", () => {
    expect(calculateAnnualizedRate(0.0001, 0)).toBe(0);
  });
});

describe("calculateDirectionalPriceSpread", () => {
  it("preserves direction from short price versus long price", () => {
    expect(calculateDirectionalPriceSpread(101_000, 100_000)).toBeCloseTo(1, 4);
    expect(calculateDirectionalPriceSpread(99_000, 100_000)).toBeCloseTo(-1, 4);
  });
});

describe("calculateOpportunityScore", () => {
  it("scores segmented annualized rates without saturating at 50 percent", () => {
    const base = {
      volume24h: 100_000_000,
      openInterestUsd: 100_000_000,
      priceSpread: 0,
      exchangeCount: 3,
      nextFundingTime
    };

    const low = calculateOpportunityScore({ ...base, annualizedRate: 20 });
    const medium = calculateOpportunityScore({ ...base, annualizedRate: 70 });
    const high = calculateOpportunityScore({ ...base, annualizedRate: 200 });

    expect(low).toBeLessThan(medium);
    expect(medium).toBeLessThan(high);
  });

  it("penalizes wide price spreads", () => {
    const base = {
      annualizedRate: 120,
      volume24h: 100_000_000,
      openInterestUsd: 100_000_000,
      exchangeCount: 3,
      nextFundingTime
    };

    expect(calculateOpportunityScore({ ...base, priceSpread: 0.2 })).toBeGreaterThan(
      calculateOpportunityScore({ ...base, priceSpread: 2.5 })
    );
  });
});

describe("getOpportunityRiskTags", () => {
  it("flags low liquidity, missing open interest, wide spread, abnormal funding, and near settlement", () => {
    const tags = getOpportunityRiskTags({
      annualizedRate: 350,
      volume24h: 500_000,
      hasMissingOpenInterest: true,
      priceSpread: 1.2,
      exchangeCount: 2,
      nextFundingTime: Date.now() + 10 * 60_000
    });

    expect(tags).toEqual(
      expect.arrayContaining([
        LOW_LIQUIDITY,
        MISSING_OPEN_INTEREST,
        WIDE_PRICE_SPREAD,
        HIGH_FUNDING_RATE,
        ABNORMAL_FUNDING_RATE,
        NEAR_SETTLEMENT
      ])
    );
  });
});

describe("calculateCrossExchangeFundingSpread", () => {
  it("selects short-high and long-low exchanges with quality metadata", () => {
    const opportunity = calculateCrossExchangeFundingSpread("BTC/USDT", [
      fundingMarket("Binance", -0.0001, 100_000),
      fundingMarket("Bybit", 0.0003, 100_300),
      fundingMarket("OKX", 0.00005, 99_900)
    ]);

    expect(opportunity).toMatchObject({
      symbol: "BTC/USDT",
      shortExchange: "Bybit",
      longExchange: "Binance",
      exchangeCount: 3
    });
    expect(opportunity?.annualizedSpread).toBeCloseTo(43.8, 2);
    expect(opportunity?.score).toBeGreaterThanOrEqual(0);
    expect(opportunity?.score).toBeLessThanOrEqual(100);
    expect(opportunity?.opportunityReason).toContain("\u65b9\u5411\u4e3a\u7a7a Bybit / \u591a Binance");
  });

  it("returns null with fewer than two markets", () => {
    expect(calculateCrossExchangeFundingSpread("BTC/USDT", [fundingMarket("Binance", 0.0001, 100_000)])).toBeNull();
  });
});

describe("calculateSpotPerpOpportunity", () => {
  it("returns same symbol spot-perp opportunities for positive funding", () => {
    const opportunity = calculateSpotPerpOpportunity(
      spotMarket("Binance", 100_000),
      fundingMarket("Binance", 0.0002, 100_200)
    );

    expect(opportunity).toMatchObject({
      symbol: "BTC/USDT",
      spotExchange: "Binance",
      perpExchange: "Binance",
      exchangeCount: 1
    });
    expect(opportunity?.annualized).toBeCloseTo(21.9, 2);
    expect(opportunity?.priceSpread).toBeCloseTo(0.2, 4);
    expect(opportunity?.opportunityReason).toContain("\u4e70\u73b0\u8d27");
  });

  it("returns null for non-positive funding", () => {
    expect(calculateSpotPerpOpportunity(spotMarket("Binance"), fundingMarket("Binance", 0, 100_000))).toBeNull();
  });
}
);
