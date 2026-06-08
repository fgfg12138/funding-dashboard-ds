import { describe, expect, it } from "vitest";
import { buildSpotPerpOpportunities } from "../lib/data/fundingService";
import type { FundingMarket, SpotMarket } from "../lib/exchanges/types";

const lowLiquidity = "\u4f4e\u6d41\u52a8\u6027";

const spot = (exchange: SpotMarket["exchange"], volume24h: number): SpotMarket => ({
  exchange,
  symbol: "BTC/USDT",
  base: "BTC",
  quote: "USDT",
  price: 100_000,
  volume24h
});

const perp = (exchange: FundingMarket["exchange"], extra: Partial<FundingMarket> = {}): FundingMarket => ({
  exchange,
  rawSymbol: `${exchange}-BTCUSDT`,
  symbol: "BTC/USDT",
  base: "BTC",
  quote: "USDT",
  fundingRate: 0.0002,
  fundingIntervalHours: 8,
  nextFundingTime: Date.now() + 2 * 60 * 60_000,
  markPrice: 100_050,
  volume24h: 500_000,
  openInterestUsd: 20_000_000,
  ...extra
});

describe("buildSpotPerpOpportunities", () => {
  it("builds same-exchange opportunities with score and risk tags", () => {
    const opportunities = buildSpotPerpOpportunities(
      [spot("Binance", 800_000), spot("OKX", 10_000_000)],
      [perp("Binance"), perp("Bybit"), perp("OKX", { volume24h: 10_000_000 })]
    );

    expect(opportunities.map((item) => `${item.spotExchange}-${item.perpExchange}`).sort()).toEqual([
      "Binance-Binance",
      "OKX-OKX"
    ]);
    expect(opportunities[0].score).toBeGreaterThanOrEqual(0);
    expect(opportunities[0].score).toBeLessThanOrEqual(100);
    expect(opportunities.find((item) => item.spotExchange === "Binance")?.riskTags).toContain(lowLiquidity);
  });
});
