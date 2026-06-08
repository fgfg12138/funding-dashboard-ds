import { describe, expect, it } from "vitest";
import type { PrivateAccountSnapshot } from "./privateAccountTypes";
import { summarizeAccountSnapshots } from "./accountSnapshotSummary";

const mockBinance: PrivateAccountSnapshot = {
  exchangeId: "Binance",
  mode: "mock",
  source: "mock",
  fetchedAt: 1_700_000_000_000,
  balances: {
    exchangeId: "Binance",
    totalUsdValue: 70_500,
    fetchedAt: 1_700_000_000_000,
    assets: [
      { asset: "USDT", free: 10_000, locked: 500, total: 10_500, usdValue: 10_500 },
      { asset: "BTC", free: 0.5, locked: 0.1, total: 0.6, usdValue: 42_000 },
      { asset: "ETH", free: 5, locked: 1, total: 6, usdValue: 18_000 },
    ],
  },
  positions: [
    {
      exchangeId: "Binance", symbol: "BTC/USDT", marketType: "perp", side: "long",
      notionalUsd: 10_000, entryPrice: 67_500, markPrice: 68_200,
      unrealizedPnl: 103.7, leverage: 2, updatedAt: 1_700_000_000_000,
    },
  ],
  openOrders: [
    {
      exchangeId: "Binance", orderId: "o1", symbol: "BTC/USDT", marketType: "perp",
      side: "buy", price: 66_000, quantity: 0.05, status: "open", createdAt: 1_699_000_000_000,
    },
  ],
  fundingPayments: [
    { exchangeId: "Binance", symbol: "BTC/USDT", amountUsd: 3.5, fundingRate: 0.00035, paidAt: 1_699_000_000_000 },
  ],
};

const mockOkx: PrivateAccountSnapshot = {
  exchangeId: "OKX",
  mode: "mock",
  source: "mock",
  fetchedAt: 1_700_000_000_000,
  balances: {
    exchangeId: "OKX",
    totalUsdValue: 30_200,
    fetchedAt: 1_700_000_000_000,
    assets: [
      { asset: "USDT", free: 20_000, locked: 200, total: 20_200, usdValue: 20_200 },
      { asset: "ETH", free: 3, locked: 0, total: 3, usdValue: 10_000 },
    ],
  },
  positions: [],
  openOrders: [],
  fundingPayments: [],
};

describe("summarizeAccountSnapshots", () => {
  it("returns zeros for empty array", () => {
    const result = summarizeAccountSnapshots([]);
    expect(result.exchangeCount).toBe(0);
    expect(result.totalUsdValue).toBe(0);
    expect(result.totalPositions).toBe(0);
    expect(result.totalOpenOrders).toBe(0);
    expect(result.totalFundingPayments).toBe(0);
    expect(result.byExchange).toEqual([]);
  });

  it("aggregates a single exchange snapshot", () => {
    const result = summarizeAccountSnapshots([mockBinance]);
    expect(result.exchangeCount).toBe(1);
    expect(result.totalUsdValue).toBe(70_500);
    expect(result.totalPositions).toBe(1);
    expect(result.totalOpenOrders).toBe(1);
    expect(result.totalFundingPayments).toBe(1);
    expect(result.source).toBe("mock");
    expect(result.byExchange[0].exchangeId).toBe("Binance");
  });

  it("aggregates multiple exchange snapshots", () => {
    const result = summarizeAccountSnapshots([mockBinance, mockOkx]);
    expect(result.exchangeCount).toBe(2);
    expect(result.totalUsdValue).toBe(70_500 + 30_200);
    expect(result.totalPositions).toBe(1);
    expect(result.totalOpenOrders).toBe(1);
    expect(result.totalFundingPayments).toBe(1);
    expect(result.byExchange).toHaveLength(2);
  });

  it("source is always mock", () => {
    const result = summarizeAccountSnapshots([mockBinance, mockOkx]);
    expect(result.source).toBe("mock");
  });
});
