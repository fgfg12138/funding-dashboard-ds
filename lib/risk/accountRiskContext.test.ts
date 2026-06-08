import { describe, expect, it } from "vitest";
import type { PrivateAccountSnapshot } from "../exchangeAdapters/privateAccountTypes";
import {
  buildAccountRiskContext,
  calculateAccountTotalUsd,
  calculateAvailableUsdBalance,
  calculateAccountOpenPositionExposure,
  calculateAccountSymbolExposure,
  calculateExchangeExposures,
} from "./accountRiskContext";

const binanceSnap: PrivateAccountSnapshot = {
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
  openOrders: [],
  fundingPayments: [],
};

const okxSnap: PrivateAccountSnapshot = {
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

const bybitSnap: PrivateAccountSnapshot = {
  exchangeId: "Bybit",
  mode: "mock",
  source: "mock",
  fetchedAt: 1_700_000_000_000,
  balances: {
    exchangeId: "Bybit",
    totalUsdValue: 22_500,
    fetchedAt: 1_700_000_000_000,
    assets: [
      { asset: "USDT", free: 15_000, locked: 500, total: 15_500, usdValue: 15_500 },
      { asset: "BTC", free: 0.1, locked: 0, total: 0.1, usdValue: 7_000 },
    ],
  },
  positions: [],
  openOrders: [],
  fundingPayments: [],
};

const allSnaps = [binanceSnap, okxSnap, bybitSnap];

describe("accountRiskContext", () => {
  describe("calculateAccountTotalUsd", () => {
    it("sums total usd across exchanges", () => {
      expect(calculateAccountTotalUsd(allSnaps)).toBe(70_500 + 30_200 + 22_500);
    });
    it("returns 0 for empty array", () => {
      expect(calculateAccountTotalUsd([])).toBe(0);
    });
  });

  describe("calculateAvailableUsdBalance", () => {
    it("sums free USDT across exchanges", () => {
      expect(calculateAvailableUsdBalance(allSnaps)).toBe(10_000 + 20_000 + 15_000);
    });
    it("returns 0 if no USDT assets", () => {
      const noUsdt: PrivateAccountSnapshot = {
        ...binanceSnap,
        balances: { ...binanceSnap.balances, assets: [{ asset: "BTC", free: 1, locked: 0, total: 1, usdValue: 70_000 }] },
      };
      expect(calculateAvailableUsdBalance([noUsdt])).toBe(0);
    });
  });

  describe("calculateAccountOpenPositionExposure", () => {
    it("sums notional across all positions", () => {
      expect(calculateAccountOpenPositionExposure(allSnaps)).toBe(10_000);
    });
    it("returns 0 when no positions", () => {
      expect(calculateAccountOpenPositionExposure([okxSnap])).toBe(0);
    });
  });

  describe("calculateAccountSymbolExposure", () => {
    it("returns notional for a known symbol", () => {
      expect(calculateAccountSymbolExposure(allSnaps, "BTC/USDT")).toBe(10_000);
    });
    it("returns 0 for unknown symbol", () => {
      expect(calculateAccountSymbolExposure(allSnaps, "ETH/USDT")).toBe(0);
    });
  });

  describe("calculateExchangeExposures", () => {
    it("maps exchange to position notional", () => {
      const result = calculateExchangeExposures(allSnaps);
      expect(result["Binance"]).toBe(10_000);
      expect(result["OKX"]).toBeUndefined();
    });
  });

  describe("buildAccountRiskContext", () => {
    it("builds a complete context with source=mock", () => {
      const ctx = buildAccountRiskContext(allSnaps);
      expect(ctx.source).toBe("mock");
      expect(ctx.totalUsdValue).toBe(70_500 + 30_200 + 22_500);
      expect(ctx.availableUsdBalance).toBe(10_000 + 20_000 + 15_000);
      expect(ctx.totalPositionExposureUsd).toBe(10_000);
      expect(ctx.symbolExposureUsdBySymbol["BTC/USDT"]).toBe(10_000);
      expect(ctx.exchangeExposureUsd["Binance"]).toBe(10_000);
    });

    it("adds warning for empty snapshots", () => {
      const ctx = buildAccountRiskContext([]);
      expect(ctx.warnings).toContain("无账户快照数据");
      expect(ctx.totalUsdValue).toBe(0);
    });

    it("source is always mock", () => {
      expect(buildAccountRiskContext(allSnaps).source).toBe("mock");
      expect(buildAccountRiskContext([]).source).toBe("mock");
    });

    it("warns when snapshot source is not mock", () => {
      const liveSnap = { ...binanceSnap, source: "live" as const };
      const ctx = buildAccountRiskContext([liveSnap]);
      expect(ctx.warnings.some((w) => w.includes("不是 Mock"))).toBe(true);
    });
  });
});
