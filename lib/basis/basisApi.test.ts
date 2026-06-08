import { describe, expect, it } from "vitest";
import { getBasisOpportunitiesResponse } from "./basisApi";
import type { FundingMarket, SpotMarket } from "../exchanges/types";

const spotMarkets: SpotMarket[] = [
  {
    exchange: "Binance",
    symbol: "ETH/USDT",
    base: "ETH",
    quote: "USDT",
    price: 3000,
    volume24h: 30_000_000
  }
];

const fundingMarkets: FundingMarket[] = [
  {
    exchange: "Binance",
    rawSymbol: "ETHUSDT",
    symbol: "ETH/USDT",
    base: "ETH",
    quote: "USDT",
    fundingRate: 0.0003,
    fundingIntervalHours: 8,
    nextFundingTime: Date.now() + 60 * 60_000,
    markPrice: 3015,
    volume24h: 40_000_000,
    openInterestUsd: 80_000_000
  }
];

describe("basisApi", () => {
  it("returns basis opportunities with API envelope shape", async () => {
    const response = await getBasisOpportunitiesResponse({
      snapshotLoader: async () => ({
        fundingMarkets,
        spotMarkets,
        errors: [],
        sourceStatus: { Binance: "ok", OKX: "failed", Bybit: "ok" },
        stale: true,
        updatedAt: 123
      }),
      now: Date.now()
    });

    expect(response).toMatchObject({
      data: [
        {
          symbol: "ETH/USDT",
          spotExchange: "Binance",
          perpExchange: "Binance"
        }
      ],
      errors: [],
      updatedAt: 123,
      stale: true,
      sourceStatus: { Binance: "ok", OKX: "failed", Bybit: "ok" }
    });
    expect(response.data[0].score).toBeGreaterThanOrEqual(0);
    expect(response.data[0].riskTags).toEqual(expect.any(Array));
  });
});
