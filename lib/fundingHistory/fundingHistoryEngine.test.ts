/**
 * Funding History Engine Tests — Beta Phase 3
 *
 * Acceptance criteria:
 *   Binance: BTCUSDT=5, ETHUSDT=-2
 *   Bybit:   BTCUSDT=6
 *   OKX:     SOLUSDT=3
 *   Merged: entries=4, total=12, BTCUSDT sum=11
 */

import { describe, expect, it } from "vitest";
import {
  calculateFundingBySymbol,
  calculateTotalFundingCollected,
  filterFundingHistory,
  mergeFundingHistorySnapshots,
  syncAllFundingHistory,
  syncFundingHistory,
} from "./fundingHistoryEngine";
import { MockBinanceFundingHistoryAdapter } from "./adapters/MockBinanceFundingHistoryAdapter";
import { MockBybitFundingHistoryAdapter } from "./adapters/MockBybitFundingHistoryAdapter";
import { MockOkxFundingHistoryAdapter } from "./adapters/MockOkxFundingHistoryAdapter";
import type { ExchangeApiKey } from "../security/apiKeyTypes";
import type { FundingHistoryEntry } from "./fundingHistoryTypes";

// ─── Helpers ─────────────────────────────────────────────

function validApiKey(exchange: string): ExchangeApiKey {
  return {
    id: `key-${exchange}`,
    exchange: exchange as ExchangeApiKey["exchange"],
    name: `${exchange}-readonly`,
    apiKey: "abc123",
    encryptedSecret: { iv: "a", authTag: "b", encrypted: "c" },
    permissions: { read: true, trade: false, withdraw: false },
    isReadOnly: true,
    withdrawEnabled: false,
    tradingEnabled: false,
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    status: "active",
  };
}

const UTC = (y: number, m: number, d: number, h: number) =>
  Date.UTC(y, m - 1, d, h, 0, 0, 0);

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  it("Binance + Bybit + OKX merge produces correct totals", async () => {
    const adapters = {
      binance: new MockBinanceFundingHistoryAdapter(),
      bybit: new MockBybitFundingHistoryAdapter(),
      okx: new MockOkxFundingHistoryAdapter(),
    };
    const apiKeys = {
      binance: validApiKey("binance"),
      bybit: validApiKey("bybit"),
      okx: validApiKey("okx"),
    };

    const results = await syncAllFundingHistory(adapters, apiKeys, {});
    expect(results.every((r) => r.success)).toBe(true);

    const merged = mergeFundingHistorySnapshots(
      results.map((r) => r.snapshot!),
    );

    expect(merged.entries.length).toBe(4); // 2 + 1 + 1
    expect(calculateTotalFundingCollected(merged.entries)).toBe(12); // 5 + (-2) + 6 + 3
    expect(calculateFundingBySymbol(merged.entries)["BTCUSDT"]).toBe(11); // 5 + 6
    expect(calculateFundingBySymbol(merged.entries)["ETHUSDT"]).toBe(-2);
    expect(calculateFundingBySymbol(merged.entries)["SOLUSDT"]).toBe(3);
  });
});

// ─── Single Exchange Sync ────────────────────────────────

describe("syncFundingHistory — single exchange", () => {
  it("syncs Binance funding history with valid read-only key", async () => {
    const result = await syncFundingHistory(
      new MockBinanceFundingHistoryAdapter(),
      validApiKey("binance"),
    );
    expect(result.success).toBe(true);
    expect(result.snapshot).toBeDefined();
    expect(result.snapshot!.entries.length).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it("empty results when filter matches nothing", () => {
    const entries: FundingHistoryEntry[] = [
      { exchange: "binance", symbol: "BTCUSDT", fundingRate: 0.0001, fundingAmountUsd: 5, positionSide: "short", settledAt: 0 },
    ];
    const filtered = filterFundingHistory(entries, { symbol: "NONEXISTENT" });
    expect(filtered).toEqual([]);
  });
});

// ─── Multi-Exchange Sync ─────────────────────────────────

describe("syncAllFundingHistory — multi exchange", () => {
  it("syncs all three exchanges successfully", async () => {
    const adapters = {
      binance: new MockBinanceFundingHistoryAdapter(),
      bybit: new MockBybitFundingHistoryAdapter(),
      okx: new MockOkxFundingHistoryAdapter(),
    };
    const apiKeys = {
      binance: validApiKey("binance"),
      bybit: validApiKey("bybit"),
      okx: validApiKey("okx"),
    };

    const results = await syncAllFundingHistory(adapters, apiKeys);
    expect(results.length).toBe(3);
    expect(results.every((r) => r.success)).toBe(true);
  });
});

// ─── mergeFundingHistorySnapshots ────────────────────────

describe("mergeFundingHistorySnapshots", () => {
  it("merges multiple snapshots correctly", () => {
    const snap1: Parameters<typeof mergeFundingHistorySnapshots>[0][0] = {
      entries: [{ exchange: "binance", symbol: "BTCUSDT", fundingRate: 0.0001, fundingAmountUsd: 5, positionSide: "short", settledAt: UTC(2026, 1, 1, 8) }],
      syncedAt: 1000,
    };
    const snap2: Parameters<typeof mergeFundingHistorySnapshots>[0][0] = {
      entries: [{ exchange: "bybit", symbol: "BTCUSDT", fundingRate: 0.00012, fundingAmountUsd: 6, positionSide: "long", settledAt: UTC(2026, 1, 1, 8) }],
      syncedAt: 2000,
    };

    const merged = mergeFundingHistorySnapshots([snap1, snap2]);
    expect(merged.entries.length).toBe(2);
    expect(merged.syncedAt).toBe(2000);
  });

  it("empty array returns empty snapshot", () => {
    const merged = mergeFundingHistorySnapshots([]);
    expect(merged.entries).toEqual([]);
    expect(typeof merged.syncedAt).toBe("number");
  });
});

// ─── filterFundingHistory ───────────────────────────────

describe("filterFundingHistory", () => {
  const entries: FundingHistoryEntry[] = [
    { exchange: "binance", symbol: "BTCUSDT", fundingRate: 0.0001, fundingAmountUsd: 5, positionSide: "short", settledAt: UTC(2026, 1, 1, 8) },
    { exchange: "binance", symbol: "ETHUSDT", fundingRate: -0.00005, fundingAmountUsd: -2, positionSide: "long", settledAt: UTC(2026, 1, 1, 8) },
    { exchange: "bybit", symbol: "BTCUSDT", fundingRate: 0.00012, fundingAmountUsd: 6, positionSide: "long", settledAt: UTC(2026, 1, 1, 8) },
    { exchange: "okx", symbol: "SOLUSDT", fundingRate: 0.0002, fundingAmountUsd: 3, positionSide: "short", settledAt: UTC(2026, 1, 1, 8) },
  ];

  it("filters by symbol", () => {
    const filtered = filterFundingHistory(entries, { symbol: "BTCUSDT" });
    expect(filtered.length).toBe(2);
    expect(filtered.every((e) => e.symbol === "BTCUSDT")).toBe(true);
  });

  it("filters by exchange", () => {
    const filtered = filterFundingHistory(entries, { exchange: "binance" });
    expect(filtered.length).toBe(2);
    expect(filtered.every((e) => e.exchange === "binance")).toBe(true);
  });

  it("filters by startTime", () => {
    const filtered = filterFundingHistory(entries, { startTime: UTC(2026, 1, 2, 0) });
    expect(filtered.length).toBe(0);
  });

  it("filters by endTime", () => {
    const filtered = filterFundingHistory(entries, { endTime: UTC(2026, 1, 1, 0) });
    expect(filtered.length).toBe(0);
  });

  it("limit cuts results after other filters", () => {
    const filtered = filterFundingHistory(entries, { limit: 1 });
    expect(filtered.length).toBe(1);
  });

  it("no filters returns all entries", () => {
    const filtered = filterFundingHistory(entries, {});
    expect(filtered.length).toBe(4);
  });
});

// ─── calculateTotalFundingCollected ─────────────────────

describe("calculateTotalFundingCollected", () => {
  it("sums all entries: 5 + (-2) + 6 + 3 = 12", () => {
    const entries: FundingHistoryEntry[] = [
      { exchange: "binance", symbol: "BTCUSDT", fundingRate: 0.0001, fundingAmountUsd: 5, positionSide: "short", settledAt: 0 },
      { exchange: "binance", symbol: "ETHUSDT", fundingRate: -0.00005, fundingAmountUsd: -2, positionSide: "long", settledAt: 0 },
      { exchange: "bybit", symbol: "BTCUSDT", fundingRate: 0.00012, fundingAmountUsd: 6, positionSide: "long", settledAt: 0 },
      { exchange: "okx", symbol: "SOLUSDT", fundingRate: 0.0002, fundingAmountUsd: 3, positionSide: "short", settledAt: 0 },
    ];
    expect(calculateTotalFundingCollected(entries)).toBe(12);
  });

  it("empty array returns 0", () => {
    expect(calculateTotalFundingCollected([])).toBe(0);
  });
});

// ─── calculateFundingBySymbol ───────────────────────────

describe("calculateFundingBySymbol", () => {
  it("groups by symbol: BTC=11, ETH=-2, SOL=3", () => {
    const entries: FundingHistoryEntry[] = [
      { exchange: "binance", symbol: "BTCUSDT", fundingRate: 0.0001, fundingAmountUsd: 5, positionSide: "short", settledAt: 0 },
      { exchange: "binance", symbol: "ETHUSDT", fundingRate: -0.00005, fundingAmountUsd: -2, positionSide: "long", settledAt: 0 },
      { exchange: "bybit", symbol: "BTCUSDT", fundingRate: 0.00012, fundingAmountUsd: 6, positionSide: "long", settledAt: 0 },
      { exchange: "okx", symbol: "SOLUSDT", fundingRate: 0.0002, fundingAmountUsd: 3, positionSide: "short", settledAt: 0 },
    ];
    const grouped = calculateFundingBySymbol(entries);
    expect(grouped["BTCUSDT"]).toBe(11);
    expect(grouped["ETHUSDT"]).toBe(-2);
    expect(grouped["SOLUSDT"]).toBe(3);
  });

  it("empty array returns empty record", () => {
    expect(calculateFundingBySymbol([])).toEqual({});
  });
});

// ─── Permission Rejection ──────────────────────────────

describe("API key permission rejection", () => {
  it("rejects non-read-only API key", async () => {
    const result = await syncFundingHistory(
      new MockBinanceFundingHistoryAdapter(),
      { ...validApiKey("binance"), isReadOnly: false, tradingEnabled: true },
    );
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("read-only"))).toBe(true);
  });

  it("rejects API key with trading enabled", async () => {
    const result = await syncFundingHistory(
      new MockBinanceFundingHistoryAdapter(),
      { ...validApiKey("binance"), tradingEnabled: true },
    );
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("trading"))).toBe(true);
  });
});

// ─── Partial Failure ───────────────────────────────────

describe("partial failure", () => {
  it("one missing API key does not block others", async () => {
    const adapters = {
      binance: new MockBinanceFundingHistoryAdapter(),
      bybit: new MockBybitFundingHistoryAdapter(),
    };
    const apiKeys = {
      binance: validApiKey("binance"),
      // bybit key missing
    };

    const results = await syncAllFundingHistory(adapters, apiKeys);
    const binResult = results.find((r) => r.exchange === "binance")!;
    expect(binResult.success).toBe(true);

    const bybitResult = results.find((r) => r.exchange === "bybit")!;
    expect(bybitResult.success).toBe(false);
    expect(bybitResult.errors.some((e) => e.includes("No API key"))).toBe(true);
  });
});

// ─── Immutability ─────────────────────────────────────

describe("immutability", () => {
  it("filterFundingHistory does not mutate input array", () => {
    const entries: FundingHistoryEntry[] = [
      { exchange: "binance", symbol: "BTCUSDT", fundingRate: 0.0001, fundingAmountUsd: 5, positionSide: "short", settledAt: 0 },
      { exchange: "bybit", symbol: "BTCUSDT", fundingRate: 0.00012, fundingAmountUsd: 6, positionSide: "long", settledAt: 0 },
    ];
    const originalLen = entries.length;
    filterFundingHistory(entries, { symbol: "BTCUSDT" });
    expect(entries.length).toBe(originalLen);
  });
});
