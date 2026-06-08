/**
 * Testnet Readiness Summary Tests — Phase 5.26
 */

import { describe, expect, it } from "vitest";
import { buildReadinessSummary, getRequiredBlockers } from "./testnetReadinessSummary";

// ─── buildReadinessSummary ───────────────────────────────

describe("buildReadinessSummary", () => {
  const summary = buildReadinessSummary();

  it("returns total >= 20", () => {
    expect(summary.total).toBeGreaterThanOrEqual(20);
  });

  it("returns pass > 10", () => {
    expect(summary.pass).toBeGreaterThan(10);
  });

  it("returns blocked >= 7", () => {
    expect(summary.blocked).toBeGreaterThanOrEqual(7);
  });

  it("returns notStarted >= 4", () => {
    expect(summary.notStarted).toBeGreaterThanOrEqual(4);
  });

  it("returns requiredBlocked > 0", () => {
    expect(summary.requiredBlocked).toBeGreaterThan(0);
  });

  it("returns ready = false", () => {
    expect(summary.ready).toBe(false);
  });

  it("byCategory has at least 5 categories", () => {
    const cats = Object.keys(summary.byCategory);
    expect(cats.length).toBeGreaterThanOrEqual(5);
  });

  it("byCategory totals add up to total", () => {
    const catTotal = Object.values(summary.byCategory).reduce((s, c) => s + c.total, 0);
    expect(catTotal).toBe(summary.total);
  });

  it("env category has items", () => {
    expect(summary.byCategory.env.total).toBeGreaterThan(2);
  });
});

// ─── getRequiredBlockers ─────────────────────────────────

describe("getRequiredBlockers", () => {
  const blockers = getRequiredBlockers();

  it("returns blockers > 0", () => {
    expect(blockers.length).toBeGreaterThan(0);
  });

  it("every blocker has id and label", () => {
    for (const b of blockers) {
      expect(b.id).toBeTruthy();
      expect(b.label).toBeTruthy();
    }
  });

  it("blocks for all critical blockers (complete list)", () => {
    const blockerIds = blockers.map((b) => b.id);
    expect(blockerIds).toContain("middleware-allowlist");
    expect(blockerIds).toContain("secret-server-retrieval");
    expect(blockerIds).toContain("real-permission-verification");
    expect(blockerIds).toContain("signing-implementation");
    expect(blockerIds).toContain("real-binance-adapter");
    expect(blockerIds).toContain("audit-persistent");
    expect(blockerIds).toContain("rollback-plan");
    expect(blockerIds).toContain("kill-switch");
    expect(blockerIds).toContain("env-separate-staging");
    expect(blockerIds).toContain("ops-approval");
    expect(blockerIds).toContain("monitoring");
  });
});
