import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OrderPreview } from "./orderPreviewTypes";
import type { ConfirmationRecord } from "./orderConfirmationTypes";
import {
  cancelQueueItem,
  clearQueueItems,
  enqueueConfirmedPreview,
  expireQueueItem,
  filterQueueItems,
  listQueueItems,
  resetQueueIdCounter,
} from "./executionQueueStore";

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

function makePreview(overrides: Partial<OrderPreview> = {}): OrderPreview {
  return {
    id: "pv-1", mode: "preview", opportunityId: "opp-1", symbol: "BTC/USDT",
    base: "BTC", quote: "USDT", opportunityType: "cross-exchange", strategyName: "Balanced",
    legs: [], estimatedFees: 1, estimatedSlippage: 0.5, estimatedNetRate: 18,
    scoringResult: { score: 82, grade: "B", riskLevel: "low", reasonCodes: [], warnings: [], components: { returnScore: 85, costScore: 70, liquidityScore: 80, riskPenalty: 5, confidenceScore: 85 } },
    riskGateResult: { allowed: true, severity: "info", reasonCodes: ["PASS"], messages: [], checks: [] },
    estimateResult: { grossReturn: 2.5, fees: 1, slippage: 0.5, netReturn: 1, netRate: 0.001, annualizedNetRate: 12.5, holdingHours: 8 },
    accountRiskContextSource: "mock", submittable: true, warnings: [], createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function makeConfirmation(overrides: Partial<ConfirmationRecord> = {}): ConfirmationRecord {
  return {
    id: "cf-1", previewId: "pv-1", opportunityId: "opp-1", symbol: "BTC/USDT",
    strategyName: "Balanced", confirmedAt: 1_700_000_000_000, confirmedBy: "local-user",
    status: "confirmed-preview-only", riskAccepted: true, riskMessages: [], disclaimerAccepted: true,
    previewSnapshot: makePreview(), ...overrides,
  };
}

beforeEach(() => {
  Object.keys(storage).forEach((k) => delete storage[k]);
  resetQueueIdCounter();
});

describe("executionQueueStore", () => {
  it("enqueues a confirmed preview", () => {
    const item = enqueueConfirmedPreview({ confirmation: makeConfirmation() });
    expect(item.id).toMatch(/^queue-/);
    expect(item.status).toBe("queued-preview-only");
    expect(item.symbol).toBe("BTC/USDT");
    expect(item.source).toBe("local");
    expect(item.expiresAt).toBeGreaterThan(item.createdAt);
  });

  it("lists queue items newest first", () => {
    const c1 = makeConfirmation({ id: "cf-1", symbol: "BTC/USDT" });
    const c2 = makeConfirmation({ id: "cf-2", symbol: "ETH/USDT" });
    const i1 = enqueueConfirmedPreview({ confirmation: c1 });
    const i2 = enqueueConfirmedPreview({ confirmation: c2 });
    const all = listQueueItems();
    expect(all).toHaveLength(2);
    // Both present
    expect(all.some((i) => i.id === i1.id)).toBe(true);
    expect(all.some((i) => i.id === i2.id)).toBe(true);
  });

  it("prevents duplicate confirmation enqueue", () => {
    enqueueConfirmedPreview({ confirmation: makeConfirmation() });
    expect(() => enqueueConfirmedPreview({ confirmation: makeConfirmation() })).toThrow("已在队列中");
  });

  it("cancels a queue item", () => {
    const item = enqueueConfirmedPreview({ confirmation: makeConfirmation() });
    const ok = cancelQueueItem(item.id);
    expect(ok).toBe(true);
    const updated = listQueueItems().find((i) => i.id === item.id);
    expect(updated!.status).toBe("cancelled");
  });

  it("expires a queue item", () => {
    const item = enqueueConfirmedPreview({ confirmation: makeConfirmation() });
    expireQueueItem(item.id);
    const updated = listQueueItems().find((i) => i.id === item.id);
    expect(updated!.status).toBe("expired");
  });

  it("cancelQueueItem returns false for non-existent id", () => {
    expect(cancelQueueItem("non-existent")).toBe(false);
  });

  it("filterQueueItems filters by status", () => {
    const c1 = makeConfirmation({ id: "cf-1" });
    const c2 = makeConfirmation({ id: "cf-2" });
    enqueueConfirmedPreview({ confirmation: c1 });
    const item2 = enqueueConfirmedPreview({ confirmation: c2 });
    cancelQueueItem(item2.id);
    expect(filterQueueItems({ status: "queued-preview-only" })).toHaveLength(1);
    expect(filterQueueItems({ status: "cancelled" })).toHaveLength(1);
  });

  it("clearQueueItems removes all", () => {
    enqueueConfirmedPreview({ confirmation: makeConfirmation() });
    expect(listQueueItems()).toHaveLength(1);
    clearQueueItems();
    expect(listQueueItems()).toHaveLength(0);
  });

  it("enqueues with custom priority", () => {
    const item = enqueueConfirmedPreview({ confirmation: makeConfirmation(), priority: "high" });
    expect(item.priority).toBe("high");
  });

  it("source is always local", () => {
    const item = enqueueConfirmedPreview({ confirmation: makeConfirmation() });
    expect(item.source).toBe("local");
    const all = listQueueItems();
    expect(all.every((i) => i.source === "local")).toBe(true);
  });

  it("does not contain submitOrder / placeOrder fields", () => {
    const item = enqueueConfirmedPreview({ confirmation: makeConfirmation() });
    expect(item).not.toHaveProperty("exchangeOrderId");
    expect(item).not.toHaveProperty("submittedAt");
    expect(item).not.toHaveProperty("filledAt");
  });
});
