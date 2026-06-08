import { describe, expect, it } from "vitest";
import { buildExchangeCompareRows } from "./exchangeCompare";
import type { FundingMarket, SpotMarket } from "../exchanges/types";

describe("buildExchangeCompareRows", () => {
  it("builds comparable rows with percent, annualized rate, and source latency", () => {
    const fundingMarkets: FundingMarket[] = [
      {
        exchange: "Binance",
        rawSymbol: "BTCUSDT",
        symbol: "BTC/USDT",
        base: "BTC",
        quote: "USDT",
        fundingRate: 0.0001,
        fundingIntervalHours: 8,
        nextFundingTime: 2_000,
        markPrice: 100_100,
        indexPrice: 100_000,
        lastPrice: 100_120,
        volume24h: 1_000_000,
        openInterest: 100,
        openInterestUsd: 10_010_000,
        fetchedAt: 1_000,
        sourceUpdatedAt: 900,
        sourceEndpoint: "premiumIndex",
        rawFields: { fundingRate: "0.0001" }
      }
    ];
    const spotMarkets: SpotMarket[] = [
      {
        exchange: "Binance",
        rawSymbol: "BTCUSDT",
        symbol: "BTC/USDT",
        base: "BTC",
        quote: "USDT",
        price: 100_050,
        volume24h: 2_000_000,
        rawFields: { lastPrice: "100050" }
      }
    ];

    const rows = buildExchangeCompareRows({ fundingMarkets, spotMarkets, symbol: "BTC/USDT", now: 1_500 });
    const binance = rows.find((row) => row.exchange === "Binance");

    expect(rows).toHaveLength(3);
    expect(binance).toMatchObject({
      rawSymbol: "BTCUSDT",
      normalizedSymbol: "BTC/USDT",
      fundingRate: 0.0001,
      fundingRatePercent: 0.01,
      latencyMs: 600,
      sourceEndpoint: "premiumIndex"
    });
    expect(binance?.annualizedRate).toBeCloseTo(10.95, 4);
  });
});
