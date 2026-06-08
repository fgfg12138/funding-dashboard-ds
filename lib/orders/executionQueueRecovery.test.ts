import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionQueueItem } from "./executionQueueTypes";
import type { SafetyState } from "../safety/safetyTypes";
import {
  findExpiredQueueItems,
  findExpiringSoonQueueItems,
  findRecoverableQueueItems,
  buildQueueHealthSummary,
  getQueueItemHealth,
} from "./executionQueueRecovery";

function makeItem(overrides: Partial<ExecutionQueueItem> & { expiresAt: number }): ExecutionQueueItem {
  return {
    id: "q-1",
    confirmationId: "cf-1",
    previewId: "pv-1",
    opportunityId: "opp-1",
    symbol: "BTC/USDT",
    strategyName: "Balanced",
    status: "queued-preview-only",
    priority: "normal",
    createdAt: 1_000_000_000,
    updatedAt: 1_000_000_000,
    expiresAt: overrides.expiresAt,
    warningFlags: [],
    previewSnapshot: {} as any,
    confirmationSnapshot: {} as any,
    source: "local",
    ...overrides,
  };
}

const NOW = 2_000_000_000; // "now" for tests

const defaultSafety: SafetyState = {
  killSwitchEnabled: false,
  reason: null,
  enabledBy: "local-user",
  enabledAt: null,
  disabledAt: null,
  updatedAt: 0,
  source: "local",
};

describe("getQueueItemHealth", () => {
  it("marks item as expired when past expiresAt", () => {
    const item = makeItem({ expiresAt: NOW - 1 });
    const result = getQueueItemHealth(item, NOW, false);
    expect(result.expired).toBe(true);
    expect(result.recoverable).toBe(false);
    expect(result.blockedByKillSwitch).toBe(false);
  });

  it("marks item as expiring soon when within 1 hour", () => {
    const item = makeItem({ expiresAt: NOW + 30 * 60 * 1000 }); // 30 min
    const result = getQueueItemHealth(item, NOW, false);
    expect(result.expiringSoon).toBe(true);
    expect(result.expired).toBe(false);
    expect(result.recoverable).toBe(true);
  });

  it("marks item as recoverable when queued and not expired and kill switch off", () => {
    const item = makeItem({ expiresAt: NOW + 3600_000 * 2 });
    const result = getQueueItemHealth(item, NOW, false);
    expect(result.recoverable).toBe(true);
    expect(result.blockedByKillSwitch).toBe(false);
  });

  it("marks item as blocked by kill switch when enabled", () => {
    const item = makeItem({ expiresAt: NOW + 3600_000 * 2 });
    const result = getQueueItemHealth(item, NOW, true);
    expect(result.recoverable).toBe(false);
    expect(result.blockedByKillSwitch).toBe(true);
  });

  it("non-queued items are not recoverable or expired", () => {
    const item = makeItem({ expiresAt: NOW - 1, status: "cancelled" });
    const result = getQueueItemHealth(item, NOW, false);
    expect(result.expired).toBe(false);
    expect(result.expiringSoon).toBe(false);
    expect(result.recoverable).toBe(false);
  });
});

describe("findExpiredQueueItems", () => {
  it("finds items past expiration", () => {
    const items = [
      makeItem({ id: "a", expiresAt: NOW - 1000 }),
      makeItem({ id: "b", expiresAt: NOW + 10000 }),
    ];
    const expired = findExpiredQueueItems(items, NOW);
    expect(expired).toHaveLength(1);
    expect(expired[0].id).toBe("a");
  });

  it("does not include cancelled or expired items", () => {
    const items = [
      makeItem({ id: "a", expiresAt: NOW - 1000, status: "cancelled" }),
      makeItem({ id: "b", expiresAt: NOW - 1000, status: "expired" }),
    ];
    expect(findExpiredQueueItems(items, NOW)).toHaveLength(0);
  });
});

describe("findExpiringSoonQueueItems", () => {
  it("finds items expiring within 1 hour", () => {
    const items = [
      makeItem({ id: "a", expiresAt: NOW + 30 * 60 * 1000 }), // 30 min
      makeItem({ id: "b", expiresAt: NOW + 90 * 60 * 1000 }), // 90 min
    ];
    const soon = findExpiringSoonQueueItems(items, NOW);
    expect(soon).toHaveLength(1);
    expect(soon[0].id).toBe("a");
  });
});

describe("findRecoverableQueueItems", () => {
  it("finds queued, non-expired items when kill switch off", () => {
    const items = [
      makeItem({ id: "a", expiresAt: NOW + 10000 }),
      makeItem({ id: "b", expiresAt: NOW - 1000 }), // expired
      makeItem({ id: "c", expiresAt: NOW + 10000, status: "cancelled" }),
    ];
    const r = findRecoverableQueueItems(items, false, NOW);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("a");
  });

  it("returns empty when kill switch enabled", () => {
    const items = [makeItem({ id: "a", expiresAt: NOW + 10000 })];
    expect(findRecoverableQueueItems(items, true, NOW)).toHaveLength(0);
  });
});

describe("buildQueueHealthSummary", () => {
  it("summarizes correctly with mixed items", () => {
    const FAR_FUTURE = NOW + 72 * 3600_000; // 3 days away
    const items = [
      makeItem({ id: "a", expiresAt: FAR_FUTURE }),            // queued, far future
      makeItem({ id: "b", expiresAt: NOW + 30 * 60 * 1000 }),  // queued, expiring soon
      makeItem({ id: "c", expiresAt: NOW - 1000 }),             // queued, expired
      makeItem({ id: "d", expiresAt: FAR_FUTURE, status: "cancelled" }),
      makeItem({ id: "e", expiresAt: FAR_FUTURE, status: "expired" }),
    ];
    const summary = buildQueueHealthSummary(items, defaultSafety, NOW);
    expect(summary.total).toBe(5);
    expect(summary.queued).toBe(3);
    expect(summary.cancelled).toBe(1);
    expect(summary.expired).toBe(1);
    expect(summary.expiringSoon).toBe(1);
    expect(summary.recoverable).toBe(2); // a + b: both queued, not expired, no KS
    expect(summary.killSwitchEnabled).toBe(false);
    expect(summary.warnings.length).toBeGreaterThan(0);
  });

  it("includes kill switch warning when enabled", () => {
    const safety: SafetyState = { ...defaultSafety, killSwitchEnabled: true };
    const summary = buildQueueHealthSummary([], safety);
    expect(summary.killSwitchEnabled).toBe(true);
    expect(summary.warnings.some((w) => w.includes("Kill Switch"))).toBe(true);
  });
});
