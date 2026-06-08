import { describe, expect, it } from "vitest";
import {
  buildAlphaComparison,
  buildAlphaDrilldown,
  buildAlphaScoreBreakdown,
  buildAlphaTimeline
} from "./alphaDrilldown";
import type { FundingHistoryRecord, OpportunityHistoryRecord } from "../data/historyStore";
import type { FundingFactorSample } from "./fundingFactors";

const HOUR = 60 * 60_000;
const NOW = Date.UTC(2026, 5, 4, 12);

function sample(overrides: Partial<FundingFactorSample> = {}): FundingFactorSample {
  return {
    id: "cross-exchange:BTC/USDT:Bybit:Binance",
    symbol: "BTC/USDT",
    type: "cross-exchange",
    latestAnnualized: 90,
    avgAnnualized: 72,
    fundingVolatility: 20,
    positiveFundingRatio: 0.8,
    volume24h: 10_000_000,
    openInterestUsd: 20_000_000,
    priceSpread: 0.3,
    score: 80,
    survivalHours: 12,
    annualizedDecay: 10,
    qualityScore: 75,
    ...overrides
  };
}

function opportunity(symbol: string, annualized: number, timestamp: number): OpportunityHistoryRecord {
  return {
    type: "cross-exchange",
    symbol,
    timestamp,
    annualized,
    annualizedSpread: annualized,
    priceSpread: symbol === "BTC/USDT" ? 0.3 : 0.5,
    score: symbol === "BTC/USDT" ? 80 : 70,
    shortExchange: "Bybit",
    longExchange: "Binance",
    exchangeCount: 2,
    volume24h: symbol === "BTC/USDT" ? 10_000_000 : 8_000_000,
    openInterestUsd: symbol === "BTC/USDT" ? 20_000_000 : 12_000_000
  };
}

function funding(symbol: string, annualizedRate: number, timestamp: number): FundingHistoryRecord {
  return {
    exchange: "Binance",
    symbol,
    fundingRate: annualizedRate / 100 / 365 / 3,
    annualizedRate,
    markPrice: 100,
    nextFundingTime: timestamp + 8 * HOUR,
    timestamp
  };
}

describe("alpha drilldown", () => {
  it("builds a score breakdown with per-factor contributions and total score", () => {
    const breakdown = buildAlphaScoreBreakdown(sample());

    expect(breakdown.totalScore).toBeGreaterThan(0);
    expect(breakdown.items.map((item) => item.factor)).toEqual([
      "latestAnnualized",
      "avgAnnualized",
      "positiveFundingRatio",
      "survivalHours",
      "annualizedDecay",
      "qualityScore",
      "fundingVolatility"
    ]);
    expect(breakdown.items.find((item) => item.factor === "latestAnnualized")).toMatchObject({
      value: 90,
      maxContribution: 25
    });
    expect(breakdown.totalScore).toBe(
      Math.round(breakdown.items.reduce((sum, item) => sum + item.contribution, 0))
    );
  });

  it("builds an alpha score timeline ordered by timestamp", () => {
    const timeline = buildAlphaTimeline([
      { timestamp: NOW, sample: sample({ latestAnnualized: 95, qualityScore: 82 }) },
      { timestamp: NOW - HOUR, sample: sample({ latestAnnualized: 70, qualityScore: 65 }) }
    ]);

    expect(timeline.map((point) => point.timestamp)).toEqual([NOW - HOUR, NOW]);
    expect(timeline[1].alphaScore).toBeGreaterThan(timeline[0].alphaScore);
    expect(timeline[1]).toMatchObject({
      symbol: "BTC/USDT",
      alphaType: "Stable Alpha"
    });
  });

  it("compares alpha metrics for BTC and ETH symbols", () => {
    const comparison = buildAlphaComparison([
      sample({ symbol: "BTC/USDT", qualityScore: 80, fundingVolatility: 15 }),
      sample({
        id: "cross-exchange:ETH/USDT:Bybit:Binance",
        symbol: "ETH/USDT",
        latestAnnualized: 65,
        survivalHours: 4,
        annualizedDecay: 35,
        qualityScore: 55,
        fundingVolatility: 45
      })
    ], ["BTC", "ETH"]);

    expect(comparison.map((row) => row.symbol)).toEqual(["BTC/USDT", "ETH/USDT"]);
    expect(comparison[0].alphaScore).toBeGreaterThan(comparison[1].alphaScore);
    expect(comparison[1]).toMatchObject({
      survivalHours: 4,
      annualizedDecay: 35,
      qualityScore: 55,
      fundingVolatility: 45
    });
  });

  it("builds drilldown data from history rows for a selected alpha id", () => {
    const result = buildAlphaDrilldown({
      id: "cross-exchange:BTC/USDT:Bybit:Binance",
      opportunityRows: [
        opportunity("BTC/USDT", 80, NOW - 2 * HOUR),
        opportunity("ETH/USDT", 60, NOW - 2 * HOUR),
        opportunity("BTC/USDT", 90, NOW),
        opportunity("ETH/USDT", 65, NOW)
      ],
      fundingRows: [
        funding("BTC/USDT", 40, NOW - 2 * HOUR),
        funding("BTC/USDT", 50, NOW),
        funding("ETH/USDT", 30, NOW - 2 * HOUR),
        funding("ETH/USDT", 32, NOW)
      ],
      now: NOW,
      windowHours: 24,
      compareSymbols: ["BTC", "ETH"]
    });

    expect(result.alpha?.id).toBe("cross-exchange:BTC/USDT:Bybit:Binance");
    expect(result.breakdown?.items).toHaveLength(7);
    expect(result.timeline).toHaveLength(2);
    expect(result.comparison.map((row) => row.symbol)).toEqual(["BTC/USDT", "ETH/USDT"]);
  });
});
