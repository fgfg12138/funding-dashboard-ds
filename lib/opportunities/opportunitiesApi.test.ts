import { describe, expect, it } from "vitest";
import { getUnifiedOpportunitiesResponse } from "./opportunitiesApi";
import type { FundingMarket, SpotMarket } from "../exchanges/types";

const fundingMarkets: FundingMarket[] = [
  {
    exchange: "Binance",
    rawSymbol: "BTCUSDT",
    symbol: "BTC/USDT",
    base: "BTC",
    quote: "USDT",
    fundingRate: 0.0003,
    fundingIntervalHours: 8,
    nextFundingTime: 12_345,
    markPrice: 100_300,
    volume24h: 10_000_000,
    openInterestUsd: 20_000_000
  },
  {
    exchange: "Bybit",
    rawSymbol: "BTCUSDT",
    symbol: "BTC/USDT",
    base: "BTC",
    quote: "USDT",
    fundingRate: -0.0001,
    fundingIntervalHours: 8,
    nextFundingTime: 12_345,
    markPrice: 100_000,
    volume24h: 12_000_000,
    openInterestUsd: 22_000_000
  }
];

const spotMarkets: SpotMarket[] = [
  {
    exchange: "Binance",
    symbol: "BTC/USDT",
    base: "BTC",
    quote: "USDT",
    price: 100_000,
    volume24h: 11_000_000
  }
];

describe("opportunitiesApi", () => {
  it("uses one snapshot loader call and returns meta counts", async () => {
    let snapshotLoaderCalls = 0;
    const response = await getUnifiedOpportunitiesResponse({
      snapshotLoader: async () => {
        snapshotLoaderCalls += 1;
        return {
          fundingMarkets,
          spotMarkets,
          errors: ["partial exchange warning"],
          sourceStatus: { Binance: "ok", OKX: "failed", Bybit: "ok" },
          stale: true,
          updatedAt: 888
        };
      },
      now: 999
    });

    expect(snapshotLoaderCalls).toBe(1);
    expect(response).toMatchObject({
      errors: ["partial exchange warning"],
      updatedAt: 888,
      stale: true,
      sourceStatus: { Binance: "ok", OKX: "failed", Bybit: "ok" },
      meta: {
        fundingMarketCount: 2,
        spotMarketCount: 1,
        crossCount: 1,
        spotPerpCount: 1,
        basisCount: 1,
        unifiedCount: 3,
        errors: ["partial exchange warning"]
      }
    });
    expect(response.data.map((row) => row.opportunityType).sort()).toEqual(["Basis", "CrossExchange", "SpotPerp"]);
  });
});
