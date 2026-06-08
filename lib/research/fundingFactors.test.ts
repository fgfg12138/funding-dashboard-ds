import { describe, expect, it } from "vitest";
import { buildFundingFactorResearch } from "./fundingFactors";
import type { FundingHistoryRecord, OpportunityHistoryRecord } from "../data/historyStore";

const HOUR = 60 * 60_000;
const NOW = Date.UTC(2026, 5, 4, 12);

function opportunity(
  symbol: string,
  annualized: number,
  priceSpread: number,
  score: number,
  timestamp: number,
  volume24h = 1_000_000,
  openInterestUsd = 2_000_000
): OpportunityHistoryRecord {
  return {
    type: "cross-exchange",
    symbol,
    timestamp,
    annualized,
    annualizedSpread: annualized,
    priceSpread,
    score,
    shortExchange: "Bybit",
    longExchange: "Binance",
    exchangeCount: 2,
    volume24h,
    openInterestUsd
  };
}

function funding(symbol: string, annualizedRate: number, timestamp: number): FundingHistoryRecord {
  return {
    exchange: "Binance",
    symbol,
    fundingRate: annualizedRate / 100 / 365 / 3,
    annualizedRate,
    markPrice: 100,
    nextFundingTime: NOW + 8 * HOUR,
    timestamp
  };
}

describe("funding factor research", () => {
  it("builds factor samples from opportunity lifecycle and funding history", () => {
    const result = buildFundingFactorResearch({
      opportunityRows: [
        opportunity("BTC/USDT", 90, 0.2, 80, NOW - 8 * HOUR, 10_000_000, 20_000_000),
        opportunity("BTC/USDT", 70, 0.5, 76, NOW, 12_000_000, 21_000_000)
      ],
      fundingRows: [
        funding("BTC/USDT", 40, NOW - 8 * HOUR),
        funding("BTC/USDT", 60, NOW)
      ],
      now: NOW,
      windowHours: 24
    });

    expect(result.samples).toHaveLength(1);
    expect(result.samples[0]).toMatchObject({
      symbol: "BTC/USDT",
      latestAnnualized: 70,
      avgAnnualized: 50,
      positiveFundingRatio: 1,
      volume24h: 12_000_000,
      openInterestUsd: 21_000_000,
      priceSpread: 0.5,
      score: 76,
      survivalHours: 8,
      annualizedDecay: 20
    });
    expect(result.samples[0].fundingVolatility).toBeCloseTo(10);
  });

  it("creates quartile buckets with average targets for each factor", () => {
    const symbols = ["A/USDT", "B/USDT", "C/USDT", "D/USDT"];
    const opportunityRows = symbols.flatMap((symbol, index) => [
      opportunity(symbol, 100 - index * 10, 0.1 + index, 50 + index * 10, NOW - (index + 1) * HOUR),
      opportunity(symbol, 90 - index * 8, 0.2 + index, 55 + index * 10, NOW)
    ]);
    const fundingRows = symbols.flatMap((symbol, index) => [
      funding(symbol, 10 + index * 20, NOW - HOUR),
      funding(symbol, 20 + index * 20, NOW)
    ]);

    const result = buildFundingFactorResearch({ opportunityRows, fundingRows, now: NOW, windowHours: 24 });
    const latestAnnualizedBuckets = result.bucketsByFactor.latestAnnualized;

    expect(latestAnnualizedBuckets).toHaveLength(4);
    expect(latestAnnualizedBuckets[0]).toMatchObject({
      bucket: "Q1",
      sampleCount: 1
    });
    expect(latestAnnualizedBuckets[0].avgSurvivalHours).toBeGreaterThan(0);
    expect(latestAnnualizedBuckets[0].avgAnnualizedDecay).toBeGreaterThan(0);
    expect(latestAnnualizedBuckets[0].avgQualityScore).toBeGreaterThan(0);
  });

  it("summarizes every requested factor", () => {
    const result = buildFundingFactorResearch({
      opportunityRows: [
        opportunity("BTC/USDT", 80, 0.2, 70, NOW - HOUR),
        opportunity("BTC/USDT", 75, 0.25, 72, NOW)
      ],
      fundingRows: [funding("BTC/USDT", 40, NOW - HOUR), funding("BTC/USDT", 42, NOW)],
      now: NOW,
      windowHours: 24
    });

    expect(result.factorSummaries.map((item) => item.factor)).toEqual([
      "latestAnnualized",
      "avgAnnualized",
      "fundingVolatility",
      "positiveFundingRatio",
      "volume24h",
      "openInterestUsd",
      "priceSpread",
      "score"
    ]);
  });
});
