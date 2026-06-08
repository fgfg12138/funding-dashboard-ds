import { describe, expect, it } from "vitest";
import { SimAccount } from "./simAccount";
import { runSimulationRound } from "./simEngine";
import type { AlphaOpportunity } from "../research/alphaScore";

const HOUR = 60 * 60_000;
const NOW = Date.UTC(2026, 5, 4, 12);

function alpha(overrides: Partial<AlphaOpportunity> = {}): AlphaOpportunity {
  return {
    id: "cross-exchange:BTC/USDT:Bybit:Binance",
    symbol: "BTC/USDT",
    type: "cross-exchange",
    latestAnnualized: 90,
    avgAnnualized: 70,
    fundingVolatility: 20,
    positiveFundingRatio: 0.95,
    volume24h: 10_000_000,
    openInterestUsd: 20_000_000,
    priceSpread: 0.3,
    score: 80,
    survivalHours: 12,
    annualizedDecay: 8,
    qualityScore: 82,
    alphaScore: 84,
    alphaGrade: "A",
    alphaType: "Stable Alpha",
    alphaReason: "Stable signal",
    exchangePair: "Bybit / Binance",
    ...overrides
  };
}

describe("simulation engine", () => {
  it("opens and closes simulated positions without touching real trading accounts", () => {
    const account = new SimAccount({ initialBalance: 10_000 });
    account.updateMarket({ symbol: "BTC/USDT", exchange: "Binance", markPrice: 100, fundingRate: 0.001, timestamp: NOW });

    const position = account.openPosition("BTC/USDT", "Binance", "cross-exchange", 2, 82, NOW);

    expect(account.positions).toHaveLength(1);
    expect(position).toMatchObject({
      symbol: "BTC/USDT",
      exchange: "Binance",
      type: "cross-exchange",
      quantity: 2,
      entryPrice: 100,
      alphaScore: 82
    });

    account.updateMarket({ symbol: "BTC/USDT", exchange: "Binance", markPrice: 110, fundingRate: 0.001, timestamp: NOW + HOUR });
    const trade = account.closePosition("BTC/USDT", "Binance", "cross-exchange", NOW + HOUR);

    expect(account.positions).toHaveLength(0);
    expect(account.tradeHistory).toHaveLength(1);
    expect(trade?.pricePnL).toBe(20);
    expect(trade?.fundingPnL).toBeCloseTo(0.2);
    expect(trade?.pnl).toBeCloseTo(20.2);
    expect(account.currentBalance).toBeCloseTo(10_020.2);
  });

  it("calculates position value, funding pnl, and total pnl for open positions", () => {
    const account = new SimAccount({ initialBalance: 10_000 });
    account.updateMarket({ symbol: "ETH/USDT", exchange: "OKX", markPrice: 200, fundingRate: 0.002, timestamp: NOW });
    account.openPosition("ETH/USDT", "OKX", "spot-perp", 3, 88, NOW);
    account.updateMarket({ symbol: "ETH/USDT", exchange: "OKX", markPrice: 210, fundingRate: 0.002, timestamp: NOW + 2 * HOUR });

    const pnl = account.calculatePnL(NOW + 2 * HOUR);

    expect(pnl.positionValue).toBe(630);
    expect(pnl.pricePnL).toBe(30);
    expect(pnl.fundingPnL).toBeCloseTo(2.4);
    expect(pnl.totalPnL).toBeCloseTo(32.4);
  });

  it("runs a simulated strategy round and avoids risky alpha", () => {
    const account = new SimAccount({ initialBalance: 10_000 });
    const result = runSimulationRound({
      account,
      alphaRows: [
        alpha({ symbol: "RISK/USDT", alphaScore: 95, alphaType: "Risky Alpha" }),
        alpha({ symbol: "BTC/USDT", alphaScore: 84, alphaType: "Stable Alpha" })
      ],
      marketData: [
        { symbol: "RISK/USDT", exchange: "Bybit", markPrice: 50, fundingRate: 0.005, timestamp: NOW },
        { symbol: "BTC/USDT", exchange: "Bybit", markPrice: 100, fundingRate: 0.001, timestamp: NOW }
      ],
      now: NOW,
      config: {
        maxPositionFraction: 0.1,
        minOpenAlphaScore: 80,
        closeAlphaScoreThreshold: 60
      }
    });

    expect(result.opened).toHaveLength(1);
    expect(result.opened[0].symbol).toBe("BTC/USDT");
    expect(result.snapshot.positions).toHaveLength(1);
    expect(result.snapshot.positions[0].quantity).toBe(10);
  });

  it("closes positions when alpha score drops below threshold", () => {
    const account = new SimAccount({ initialBalance: 10_000 });
    runSimulationRound({
      account,
      alphaRows: [alpha({ alphaScore: 84 })],
      marketData: [{ symbol: "BTC/USDT", exchange: "Bybit", markPrice: 100, fundingRate: 0.001, timestamp: NOW }],
      now: NOW,
      config: { maxPositionFraction: 0.1, minOpenAlphaScore: 80, closeAlphaScoreThreshold: 60 }
    });

    const result = runSimulationRound({
      account,
      alphaRows: [alpha({ alphaScore: 55 })],
      marketData: [{ symbol: "BTC/USDT", exchange: "Bybit", markPrice: 105, fundingRate: 0.001, timestamp: NOW + HOUR }],
      now: NOW + HOUR,
      config: { maxPositionFraction: 0.1, minOpenAlphaScore: 80, closeAlphaScoreThreshold: 60 }
    });

    expect(result.closed).toHaveLength(1);
    expect(result.snapshot.positions).toHaveLength(0);
    expect(result.snapshot.currentBalance).toBeGreaterThan(10_000);
  });

  it("keeps multi-round simulation snapshots consistent", () => {
    const account = new SimAccount({ initialBalance: 10_000 });
    const first = runSimulationRound({
      account,
      alphaRows: [alpha({ alphaScore: 90 })],
      marketData: [{ symbol: "BTC/USDT", exchange: "Bybit", markPrice: 100, fundingRate: 0.001, timestamp: NOW }],
      now: NOW,
      config: { maxPositionFraction: 0.1, minOpenAlphaScore: 80, closeAlphaScoreThreshold: 60 }
    });
    const second = runSimulationRound({
      account,
      alphaRows: [alpha({ alphaScore: 88 })],
      marketData: [{ symbol: "BTC/USDT", exchange: "Bybit", markPrice: 102, fundingRate: 0.001, timestamp: NOW + HOUR }],
      now: NOW + HOUR,
      config: { maxPositionFraction: 0.1, minOpenAlphaScore: 80, closeAlphaScoreThreshold: 60 }
    });

    expect(first.snapshot.timestamp).toBe(NOW);
    expect(second.snapshot.timestamp).toBe(NOW + HOUR);
    expect(second.snapshot.equity).toBeGreaterThan(first.snapshot.equity);
    expect(second.snapshot.positions).toHaveLength(1);
  });
});
