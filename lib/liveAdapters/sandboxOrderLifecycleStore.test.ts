import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TradingOrderResult } from "./tradingAdapterTypes";
import {
  appendSandboxOrderResult,
  clearSandboxLifecycleRecords,
  createSandboxLifecycleRecord,
  getSandboxLifecycleRecord,
  listSandboxLifecycleRecords,
  markSandboxCancelled,
  markSandboxFailed,
  resetLifecycleIdCounter,
} from "./sandboxOrderLifecycleStore";

const storage: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => { storage[k] = v; },
    removeItem: (k: string) => { delete storage[k]; },
    clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
  },
  writable: true,
  configurable: true,
});

beforeEach(() => {
  Object.keys(storage).forEach((k) => delete storage[k]);
  resetLifecycleIdCounter();
});

const sampleInput = {
  queueItemId: "q-1",
  confirmationId: "cf-1",
  previewId: "pv-1",
  opportunityId: "opp-1",
  symbol: "BTC/USDT",
  exchangeId: "Binance" as const,
  request: {
    exchangeId: "Binance" as const,
    symbol: "BTC/USDT",
    marketType: "perp" as const,
    intent: "open" as const,
    side: "short" as const,
    orderType: "market" as const,
    quantity: 0.01,
    notionalUsd: 1000,
    reduceOnly: false,
    clientOrderId: "mock-Binance-123",
  },
};

function makeResult(overrides: Partial<TradingOrderResult> = {}): TradingOrderResult {
  return {
    exchangeId: "Binance",
    orderId: "mock-order-1",
    clientOrderId: "mock-Binance-123",
    symbol: "BTC/USDT",
    side: "short",
    orderType: "market",
    price: 0,
    quantity: 0.01,
    filledQuantity: 0,
    status: "sandbox-submitted",
    source: "mock-sandbox",
    submittedAt: Date.now(),
    ...overrides,
  } as TradingOrderResult;
}

describe("sandboxOrderLifecycleStore", () => {
  it("creates a lifecycle record with sandbox-ready status", () => {
    const record = createSandboxLifecycleRecord(sampleInput);
    expect(record.id).toMatch(/^sandbox-lifecycle-/);
    expect(record.currentStatus).toBe("sandbox-ready");
    expect(record.source).toBe("mock-sandbox");
    expect(record.resultHistory).toEqual([]);
    expect(record.warningFlags).toContain("mock-sandbox-only");
  });

  it("lists records newest first", () => {
    const r1 = createSandboxLifecycleRecord(sampleInput);
    const r2 = createSandboxLifecycleRecord({ ...sampleInput, symbol: "ETH/USDT" });
    const all = listSandboxLifecycleRecords();
    expect(all).toHaveLength(2);
    expect(all.some((r) => r.id === r1.id)).toBe(true);
    expect(all.some((r) => r.id === r2.id)).toBe(true);
  });

  it("gets a record by id", () => {
    const record = createSandboxLifecycleRecord(sampleInput);
    const found = getSandboxLifecycleRecord(record.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(record.id);
  });

  it("appends result and updates currentStatus", () => {
    const record = createSandboxLifecycleRecord(sampleInput);
    const result = makeResult({ status: "sandbox-submitted" });
    const updated = appendSandboxOrderResult(record.id, result);
    expect(updated).toBeDefined();
    expect(updated!.currentStatus).toBe("sandbox-submitted");
    expect(updated!.resultHistory).toHaveLength(1);
    expect(updated!.submittedAt).toBeGreaterThan(0);
  });

  it("appends multiple results tracking full lifecycle", () => {
    const record = createSandboxLifecycleRecord(sampleInput);
    appendSandboxOrderResult(record.id, makeResult({ status: "sandbox-submitted", submittedAt: Date.now() - 2000 }));
    appendSandboxOrderResult(record.id, makeResult({ status: "sandbox-filled", filledQuantity: 0.01, filledAt: Date.now() }));
    const final = getSandboxLifecycleRecord(record.id);
    expect(final!.resultHistory).toHaveLength(2);
    expect(final!.currentStatus).toBe("sandbox-filled");
    expect(final!.filledAt).toBeGreaterThan(0);
  });

  it("markSandboxCancelled updates status", () => {
    const record = createSandboxLifecycleRecord(sampleInput);
    const updated = markSandboxCancelled(record.id, "User cancelled");
    expect(updated).toBeDefined();
    expect(updated!.currentStatus).toBe("sandbox-cancelled");
    expect(updated!.cancelledAt).toBeGreaterThan(0);
    expect(updated!.resultHistory[0].status).toBe("sandbox-cancelled");
  });

  it("markSandboxFailed updates status", () => {
    const record = createSandboxLifecycleRecord(sampleInput);
    const updated = markSandboxFailed(record.id, "Insufficient balance");
    expect(updated).toBeDefined();
    expect(updated!.currentStatus).toBe("sandbox-failed");
    expect(updated!.failedAt).toBeGreaterThan(0);
    expect(updated!.resultHistory[0].errorMessage).toBe("Insufficient balance");
  });

  it("append returns undefined for non-existent id", () => {
    const result = appendSandboxOrderResult("non-existent", makeResult());
    expect(result).toBeUndefined();
  });

  it("clear removes all records", () => {
    createSandboxLifecycleRecord(sampleInput);
    expect(listSandboxLifecycleRecords()).toHaveLength(1);
    clearSandboxLifecycleRecords();
    expect(listSandboxLifecycleRecords()).toHaveLength(0);
  });

  it("source is always mock-sandbox", () => {
    const record = createSandboxLifecycleRecord(sampleInput);
    expect(record.source).toBe("mock-sandbox");
  });
});
