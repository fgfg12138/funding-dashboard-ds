import { describe, expect, it } from "vitest";
import { buildFundingHeatmap } from "./fundingHeatmap";
import type { FundingHistoryRecord } from "../data/historyStore";

const HOUR = 60 * 60_000;
const NOW = Date.UTC(2026, 5, 4, 12);

function funding(
  exchange: FundingHistoryRecord["exchange"],
  symbol: string,
  annualizedRate: number,
  timestamp: number
): FundingHistoryRecord {
  return {
    exchange,
    symbol,
    fundingRate: annualizedRate / 100 / 365 / 3,
    annualizedRate,
    markPrice: 100,
    nextFundingTime: NOW + 8 * HOUR,
    timestamp
  };
}

describe("fundingHeatmap", () => {
  it("aggregates funding history by exchange and symbol", () => {
    const result = buildFundingHeatmap(
      [
        funding("Binance", "BTC/USDT", 30, NOW - 2 * HOUR),
        funding("Binance", "BTC/USDT", 60, NOW - HOUR),
        funding("Binance", "BTC/USDT", -15, NOW),
        funding("OKX", "ETH/USDT", -20, NOW)
      ],
      { now: NOW, windowHours: 24 }
    );

    const btc = result.rows.find((row) => row.exchange === "Binance" && row.symbol === "BTC/USDT");

    expect(btc).toMatchObject({
      exchange: "Binance",
      symbol: "BTC/USDT",
      latestAnnualized: -15,
      avgAnnualized: 25,
      maxAnnualized: 60,
      minAnnualized: -15,
      snapshotCount: 3,
      positiveFundingRatio: 2 / 3,
      negativeFundingRatio: 1 / 3
    });
    expect(btc?.volatility).toBeGreaterThan(20);
  });

  it("filters by window, exchange, and min snapshot count", () => {
    const result = buildFundingHeatmap(
      [
        funding("Binance", "BTC/USDT", 100, NOW - 30 * HOUR),
        funding("Binance", "BTC/USDT", 80, NOW - HOUR),
        funding("OKX", "ETH/USDT", 70, NOW - HOUR),
        funding("OKX", "ETH/USDT", 72, NOW)
      ],
      { now: NOW, windowHours: 24, exchange: "OKX", minSnapshotCount: 2 }
    );

    expect(result.rows.map((row) => `${row.exchange}:${row.symbol}`)).toEqual(["OKX:ETH/USDT"]);
  });

  it("builds positive, negative, volatile, and persistent positive lists", () => {
    const result = buildFundingHeatmap(
      [
        funding("Binance", "POS/USDT", 40, NOW - 2 * HOUR),
        funding("Binance", "POS/USDT", 45, NOW - HOUR),
        funding("Binance", "POS/USDT", 50, NOW),
        funding("Bybit", "NEG/USDT", -20, NOW - HOUR),
        funding("Bybit", "NEG/USDT", -40, NOW),
        funding("OKX", "VOL/USDT", -80, NOW - HOUR),
        funding("OKX", "VOL/USDT", 80, NOW)
      ],
      { now: NOW, windowHours: 24 }
    );

    expect(result.topPositive[0].symbol).toBe("VOL/USDT");
    expect(result.topNegative[0].symbol).toBe("NEG/USDT");
    expect(result.mostVolatile[0].symbol).toBe("VOL/USDT");
    expect(result.persistentPositive[0].symbol).toBe("POS/USDT");
  });
});
