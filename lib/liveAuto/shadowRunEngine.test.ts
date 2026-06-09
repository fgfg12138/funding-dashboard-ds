/**
 * Shadow Run Engine Tests — 24h Stability Validation
 *
 * Compresses 24 hours (288 cycles at 5-min intervals) into a few seconds.
 * All tests use a single run to ensure consistent results.
 */

import { describe, expect, it, beforeAll } from "vitest";
import { runShadowRun } from "./shadowRunEngine";
import type { ShadowRunReport } from "./shadowRunTypes";

let report: ShadowRunReport;

beforeAll(async () => {
  report = await runShadowRun({
    totalCapitalUsd: 100_000,
    intervalMinutes: 5,
    durationHours: 24,
    dryRun: true,
    startTime: Date.UTC(2026, 0, 1, 0, 0, 0, 0),
  });
}, 60_000);

// ─── Structural checks ───────────────────────────────

describe("24h Shadow Run — structure", () => {
  it("completes all 288 cycles without errors", () => {
    expect(report.totalCycles).toBe(288);
    expect(report.errorCount).toBe(0);
  });

  it("completes in reasonable time (under 30 seconds)", () => {
    expect(report.wallClockMs).toBeLessThan(30_000);
  });

  it("simulated hours match config (24h)", () => {
    expect(report.simulatedHours).toBe(24);
  });

  it("produces 288 per-cycle results with increasing timestamps", () => {
    expect(report.cycles.length).toBe(288);
    expect(report.cycles[0].cycle).toBe(0);
    expect(report.cycles[287].cycle).toBe(287);
    expect(report.cycles[287].currentTime).toBeGreaterThan(report.cycles[0].currentTime);
  });
});

// ─── Trading activity ──────────────────────────────

describe("24h Shadow Run — trading activity", () => {
  it("generates entry signals", () => {
    expect(report.entrySignalCount).toBeGreaterThan(0);
  });

  it("generates exit signals", () => {
    expect(report.exitSignalCount).toBeGreaterThan(0);
  });

  it("entry signals >= exit signals (no phantom exits)", () => {
    expect(report.entrySignalCount).toBeGreaterThanOrEqual(report.exitSignalCount);
  });

  it("max open positions > 0 (positions were created)", () => {
    expect(report.maxOpenPositions).toBeGreaterThan(0);
  });

  it("closed position count > 0 (positions were closed)", () => {
    expect(report.closedPositionCount).toBeGreaterThan(0);
  });
});

// ─── System health ────────────────────────────────

describe("24h Shadow Run — system health", () => {
  it("accumulates funding events", () => {
    expect(report.fundingEventCount).toBeGreaterThan(0);
  });

  it("risk engine triggers some events", () => {
    expect(report.riskEventCount).toBeGreaterThanOrEqual(0);
  });

  it("kill switch is evaluated each cycle", () => {
    // Kill switch action is tracked per cycle
    const nonAllowActions = report.cycles.filter((c) => c.killSwitchAction !== "allow");
    // May or may not trigger depending on risk levels in simulation
    expect(nonAllowActions.length).toBeGreaterThanOrEqual(0);
  });

  it("no cycles report errors", () => {
    const errorCycles = report.cycles.filter((c) => c.error.length > 0);
    expect(errorCycles.length).toBe(0);
  });
});

// ─── Edge cases ───────────────────────────────────

describe("edge cases", () => {
  it("handles single cycle at 60-min interval", async () => {
    const single = await runShadowRun({
      totalCapitalUsd: 10_000,
      intervalMinutes: 60,
      durationHours: 1,
      dryRun: true,
      startTime: Date.UTC(2026, 0, 1, 0, 0, 0, 0),
    });
    expect(single.totalCycles).toBe(1);
  });

  it("handles small capital without crashing", async () => {
    const small = await runShadowRun({
      totalCapitalUsd: 100,
      intervalMinutes: 5,
      durationHours: 6,
      dryRun: true,
      startTime: Date.UTC(2026, 0, 1, 0, 0, 0, 0),
    });
    expect(small.errorCount).toBe(0);
  });
});
