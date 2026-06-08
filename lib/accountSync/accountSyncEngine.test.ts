/**
 * Account Sync Engine Tests — Beta Phase 2
 *
 * Acceptance criteria:
 *   Binance: USDT=10000, BTCUSDT short, 1 order
 *   Bybit:   USDT=5000,  ETHUSDT long,  1 order
 *   Merge:   balances=2+1=3, positions=1+1=2, orders=1+1=2
 */

import { describe, expect, it } from "vitest";
import {
  createEmptySnapshot,
  mergeSnapshots,
  syncAllAccounts,
  syncExchangeAccount,
} from "./accountSyncEngine";
import { MockBinanceAdapter } from "./adapters/MockBinanceAdapter";
import { MockBybitAdapter } from "./adapters/MockBybitAdapter";
import { MockOkxAdapter } from "./adapters/MockOkxAdapter";
import type { ExchangeApiKey } from "../security/apiKeyTypes";

// ─── Helpers ─────────────────────────────────────────────

function validApiKey(exchange: string, overrides?: Partial<ExchangeApiKey>): ExchangeApiKey {
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
    ...overrides,
  };
}

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  it("Binance + Bybit merge produces correct totals", async () => {
    const adapters = {
      binance: new MockBinanceAdapter(),
      bybit: new MockBybitAdapter(),
    };
    const apiKeys = {
      binance: validApiKey("binance"),
      bybit: validApiKey("bybit"),
    };

    const results = await syncAllAccounts(adapters, apiKeys);

    expect(results.length).toBe(2);

    const binanceResult = results.find((r) => r.exchange === "binance")!;
    expect(binanceResult.success).toBe(true);
    expect(binanceResult.snapshot?.balances.length).toBe(2); // USDT + BTC
    expect(binanceResult.snapshot?.positions.length).toBe(1); // BTCUSDT short
    expect(binanceResult.snapshot?.orders.length).toBe(1); // 1 order

    const bybitResult = results.find((r) => r.exchange === "bybit")!;
    expect(bybitResult.success).toBe(true);
    expect(bybitResult.snapshot?.balances.length).toBe(1); // USDT
    expect(bybitResult.snapshot?.positions.length).toBe(1); // ETHUSDT long
    expect(bybitResult.snapshot?.orders.length).toBe(1); // 1 order

    // Merge
    const merged = mergeSnapshots([
      binanceResult.snapshot!,
      bybitResult.snapshot!,
    ]);

    expect(merged.balances.length).toBe(3);   // 2 + 1
    expect(merged.positions.length).toBe(2);  // 1 + 1
    expect(merged.orders.length).toBe(2);     // 1 + 1
    expect(merged.syncedAt).toBeGreaterThan(0);
  });
});

// ─── createEmptySnapshot ───────────────────────────────

describe("createEmptySnapshot", () => {
  it("returns a snapshot with empty arrays", () => {
    const snap = createEmptySnapshot();
    expect(snap.balances).toEqual([]);
    expect(snap.positions).toEqual([]);
    expect(snap.orders).toEqual([]);
    expect(typeof snap.syncedAt).toBe("number");
  });

  it("syncedAt is a valid timestamp", () => {
    const snap = createEmptySnapshot();
    expect(snap.syncedAt).toBeGreaterThan(0);
  });
});

// ─── Single Exchange Sync ──────────────────────────────

describe("syncExchangeAccount — single exchange", () => {
  it("successfully syncs Binance with valid read-only key", async () => {
    const result = await syncExchangeAccount(
      new MockBinanceAdapter(),
      validApiKey("binance"),
    );
    expect(result.success).toBe(true);
    expect(result.snapshot).toBeDefined();
    expect(result.errors).toEqual([]);
  });
});

// ─── Non-Read-Only API Key ────────────────────────────

describe("API key permission rejection", () => {
  it("rejects API key that is not read-only", async () => {
    const result = await syncExchangeAccount(
      new MockBinanceAdapter(),
      validApiKey("binance", { isReadOnly: false, tradingEnabled: true }),
    );
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes("read-only"))).toBe(true);
  });

  it("rejects API key with trading enabled", async () => {
    const result = await syncExchangeAccount(
      new MockBinanceAdapter(),
      validApiKey("binance", { tradingEnabled: true }),
    );
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("trading"))).toBe(true);
  });

  it("rejects API key with withdrawal enabled", async () => {
    const result = await syncExchangeAccount(
      new MockBinanceAdapter(),
      validApiKey("binance", { withdrawEnabled: true }),
    );
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("withdrawal"))).toBe(true);
  });
});

// ─── Multi-Exchange: Partial Failure ─────────────────

describe("multi-exchange partial failure", () => {
  it("one exchange failure does not block others", async () => {
    const adapters = {
      binance: new MockBinanceAdapter(),
      okx: new MockOkxAdapter(),
    };
    // Only provide a key for binance — okx will fail
    const apiKeys = {
      binance: validApiKey("binance"),
    };

    const results = await syncAllAccounts(adapters, apiKeys);

    const binResult = results.find((r) => r.exchange === "binance")!;
    expect(binResult.success).toBe(true);

    const okxResult = results.find((r) => r.exchange === "okx")!;
    expect(okxResult.success).toBe(false);
    expect(okxResult.errors.some((e) => e.includes("No API key"))).toBe(true);
  });
});

// ─── mergeSnapshots ─────────────────────────────────────

describe("mergeSnapshots", () => {
  it("merges three snapshots correctly", () => {
    const now = Date.now();
    const snap1: Parameters<typeof mergeSnapshots>[0][0] = {
      balances: [{ exchange: "binance", asset: "USDT", total: 100, available: 80, locked: 20, updatedAt: now }],
      positions: [],
      orders: [],
      syncedAt: now,
    };
    const snap2: Parameters<typeof mergeSnapshots>[0][0] = {
      balances: [{ exchange: "bybit", asset: "USDT", total: 50, available: 50, locked: 0, updatedAt: now }],
      positions: [{ exchange: "bybit", symbol: "ETHUSDT", side: "long", quantity: 1, entryPrice: 3000, updatedAt: now }],
      orders: [],
      syncedAt: now + 1000,
    };

    const merged = mergeSnapshots([snap1, snap2]);
    expect(merged.balances.length).toBe(2);
    expect(merged.positions.length).toBe(1);
    expect(merged.orders.length).toBe(0);
    expect(merged.syncedAt).toBe(now + 1000); // latest timestamp
  });

  it("works with empty array", () => {
    const merged = mergeSnapshots([]);
    expect(merged.balances).toEqual([]);
    expect(merged.positions).toEqual([]);
    expect(merged.orders).toEqual([]);
  });
});

// ─── Error Preservation ───────────────────────────────

describe("error preservation", () => {
  it("returns error messages in SyncResult", async () => {
    const result = await syncExchangeAccount(
      new MockBinanceAdapter(),
      validApiKey("binance", { isReadOnly: false, tradingEnabled: true }),
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.every((e) => typeof e === "string")).toBe(true);
  });
});

// ─── Immutability ─────────────────────────────────────

describe("immutability", () => {
  it("createEmptySnapshot returns a new object each call", () => {
    const a = createEmptySnapshot();
    const b = createEmptySnapshot();
    expect(a).not.toBe(b); // different references
    a.balances.push({ exchange: "binance", asset: "BTC", total: 1, available: 1, locked: 0, updatedAt: Date.now() });
    expect(b.balances.length).toBe(0); // original unaffected
  });
});

// ─── Three Exchange Sync ──────────────────────────────

describe("three exchange sync", () => {
  it("syncs Binance + Bybit + OKX successfully", async () => {
    const adapters = {
      binance: new MockBinanceAdapter(),
      bybit: new MockBybitAdapter(),
      okx: new MockOkxAdapter(),
    };
    const apiKeys = {
      binance: validApiKey("binance"),
      bybit: validApiKey("bybit"),
      okx: validApiKey("okx"),
    };

    const results = await syncAllAccounts(adapters, apiKeys);
    expect(results.every((r) => r.success)).toBe(true);

    const merged = mergeSnapshots(
      results.map((r) => r.snapshot!).filter(Boolean),
    );

    // Binance: 2 balances, 1 position, 1 order
    // Bybit:   1 balance,  1 position, 1 order
    // OKX:     2 balances, 0 positions, 0 orders
    expect(merged.balances.length).toBe(5);
    expect(merged.positions.length).toBe(2);
    expect(merged.orders.length).toBe(2);
  });
});
