import { describe, expect, it } from "vitest";
import {
  analyzeOpportunityLifecycles,
  buildOpportunityResearch,
  calculateHistoricalQualityScore
} from "./opportunityValidation";
import type { OpportunityHistoryRecord } from "../data/historyStore";
import type { ExchangeName } from "../exchanges/types";

const HOUR = 60 * 60_000;
const NOW = Date.UTC(2026, 5, 4, 12);

function cross(
  symbol: string,
  annualizedSpread: number,
  priceSpread: number,
  score: number,
  timestamp: number,
  exchanges: [ExchangeName, ExchangeName] = ["Bybit", "Binance"]
): OpportunityHistoryRecord {
  return {
    type: "cross-exchange",
    symbol,
    timestamp,
    annualized: annualizedSpread,
    annualizedSpread,
    priceSpread,
    score,
    direction: `空 ${exchanges[0]} / 多 ${exchanges[1]}`,
    shortExchange: exchanges[0],
    longExchange: exchanges[1],
    exchangeCount: 2
  };
}

function spot(symbol: string, annualized: number, priceSpread: number, score: number, timestamp: number): OpportunityHistoryRecord {
  return {
    type: "spot-perp",
    symbol,
    timestamp,
    annualized,
    annualizedRate: annualized,
    priceSpread,
    score,
    spotExchange: "Binance",
    perpExchange: "Binance",
    exchangeCount: 1
  };
}

describe("opportunity validation", () => {
  it("calculates lifecycle fields for grouped opportunities", () => {
    const rows = [
      cross("BTC/USDT", 80, 0.2, 70, NOW - 8 * HOUR),
      cross("BTC/USDT", 70, 0.35, 72, NOW - 4 * HOUR),
      cross("BTC/USDT", 55, 0.5, 68, NOW),
      spot("ETH/USDT", 40, 0.1, 62, NOW - HOUR)
    ];

    const lifecycles = analyzeOpportunityLifecycles(rows, { now: NOW, windowHours: 24 });
    const btc = lifecycles.find((item) => item.symbol === "BTC/USDT");

    expect(btc).toMatchObject({
      symbol: "BTC/USDT",
      type: "cross-exchange",
      survivalHours: 8,
      maxAnnualized: 80,
      minAnnualized: 55,
      annualizedDecay: 25,
      priceSpreadChange: 0.3,
      latestAnnualized: 55,
      latestScore: 68
    });
    expect(btc?.qualityScore).toBeGreaterThan(0);
  });

  it("filters lifecycle analysis to the requested time window", () => {
    const rows = [
      cross("BTC/USDT", 80, 0.2, 70, NOW - 8 * HOUR),
      cross("BTC/USDT", 60, 0.4, 70, NOW - 2 * HOUR),
      cross("BTC/USDT", 58, 0.45, 70, NOW)
    ];

    const [btc] = analyzeOpportunityLifecycles(rows, { now: NOW, windowHours: 4 });

    expect(btc.survivalHours).toBe(2);
    expect(btc.maxAnnualized).toBe(60);
    expect(btc.annualizedDecay).toBe(2);
  });

  it("rewards historically stable opportunities in quality score", () => {
    const stable = calculateHistoricalQualityScore({
      latestScore: 70,
      survivalHours: 24,
      windowHours: 24,
      annualizedDecay: 2,
      firstAnnualized: 80,
      priceSpreadChange: 0.05
    });
    const decayed = calculateHistoricalQualityScore({
      latestScore: 70,
      survivalHours: 2,
      windowHours: 24,
      annualizedDecay: 60,
      firstAnnualized: 80,
      priceSpreadChange: 1.5
    });

    expect(stable).toBeGreaterThan(decayed);
    expect(stable).toBeLessThanOrEqual(100);
  });

  it("builds stable, decayed, and longest-survival research lists", () => {
    const rows = [
      cross("STABLE/USDT", 90, 0.2, 78, NOW - 24 * HOUR),
      cross("STABLE/USDT", 88, 0.22, 80, NOW),
      cross("DECAY/USDT", 120, 0.1, 75, NOW - 8 * HOUR, ["OKX", "Binance"]),
      cross("DECAY/USDT", 35, 1.2, 50, NOW, ["OKX", "Binance"]),
      spot("LONG/USDT", 45, 0.3, 66, NOW - 24 * HOUR),
      spot("LONG/USDT", 44, 0.35, 68, NOW)
    ];

    const research = buildOpportunityResearch(rows, { now: NOW, windowHours: 24, limit: 2 });

    expect(research.topStable[0].symbol).toBe("STABLE/USDT");
    expect(research.topDecayed[0].symbol).toBe("DECAY/USDT");
    expect(research.longestSurvival[0].survivalHours).toBe(24);
    expect(research.topStable).toHaveLength(2);
  });

  it("applies default stable filters without hiding decayed opportunities", () => {
    const rows = [
      cross("GOOD/USDT", 80, 0.2, 80, NOW - 8 * HOUR),
      cross("GOOD/USDT", 70, 0.25, 82, NOW),
      cross("LOW/USDT", 25, 0.2, 90, NOW - 8 * HOUR, ["OKX", "Binance"]),
      cross("LOW/USDT", 24, 0.25, 90, NOW, ["OKX", "Binance"]),
      cross("SHORT/USDT", 90, 0.2, 90, NOW - 2 * HOUR, ["Bybit", "OKX"]),
      cross("SHORT/USDT", 88, 0.25, 90, NOW, ["Bybit", "OKX"]),
      cross("DECAY/USDT", 120, 0.2, 70, NOW - 8 * HOUR),
      cross("DECAY/USDT", 50, 0.25, 70, NOW)
    ];

    const research = buildOpportunityResearch(rows, { now: NOW, windowHours: 24, limit: 10 });

    expect(research.topStable.map((row) => row.symbol)).toEqual(["GOOD/USDT"]);
    expect(research.topDecayed[0].symbol).toBe("DECAY/USDT");
  });

  it("filters research lists by annualized, survival, decay, price spread change, and type", () => {
    const rows = [
      cross("BTC/USDT", 90, 0.2, 82, NOW - 8 * HOUR),
      cross("BTC/USDT", 70, 0.5, 82, NOW),
      spot("ETH/USDT", 60, 0.1, 80, NOW - 8 * HOUR),
      spot("ETH/USDT", 58, 0.2, 80, NOW),
      spot("SOL/USDT", 40, 0.1, 70, NOW - 2 * HOUR),
      spot("SOL/USDT", 39, 0.2, 70, NOW)
    ];

    const research = buildOpportunityResearch(rows, {
      now: NOW,
      windowHours: 24,
      limit: 10,
      filters: {
        type: "spot-perp",
        minLatestAnnualized: 50,
        minSurvivalHours: 4,
        maxAnnualizedDecay: 5,
        maxAbsPriceSpreadChange: 0.2
      }
    });

    expect(research.topStable.map((row) => row.symbol)).toEqual(["ETH/USDT"]);
    expect(research.topDecayed.map((row) => row.symbol)).toEqual(["ETH/USDT"]);
    expect(research.longestSurvival.map((row) => row.symbol)).toEqual(["ETH/USDT"]);
  });
});
