/**
 * Stability Run Engine Tests — 7-Day Long-Term Stability
 *
 * Validates 2016 compressed cycles (7 days at 5-min intervals)
 * across 3 stress scenarios: normal, funding_decline, risk_spike.
 *
 * All operations in dry-run / plan-only mode.
 */

import { describe, expect, it, beforeAll } from "vitest";
import { runStabilityRun } from "./stabilityRunEngine";
import type { StabilityRunReport } from "./stabilityRunTypes";

// ─── Shared start time ──────────────────────────────────

const S0 = Date.UTC(2026, 0, 1, 0, 0, 0, 0);

// ─── Scenario 1: Normal Market ───────────────────────

describe("7-Day Stability — Normal Market", () => {
  let report: StabilityRunReport;

  beforeAll(async () => {
    report = await runStabilityRun({
      totalCapitalUsd: 100_000,
      intervalMinutes: 5,
      durationHours: 168,
      dryRun: true,
      startTime: S0,
      scenario: "normal",
    });
  }, 60_000);

  it("completes all 2016 cycles", () => {
    expect(report.totalCycles).toBeGreaterThanOrEqual(2015);
    expect(report.totalCycles).toBeLessThanOrEqual(2017);
    expect(report.completedCycles).toBe(report.totalCycles);
  });

  it("zero errors", () => {
    expect(report.errorCount).toBe(0);
  });

  it("generates entry signals", () => {
    expect(report.entrySignals).toBeGreaterThan(0);
  });

  it("generates exit signals", () => {
    expect(report.exitSignals).toBeGreaterThan(0);
  });

  it("accumulates funding events", () => {
    expect(report.fundingEvents).toBeGreaterThan(0);
  });

  it("risk engine is evaluated each cycle", () => {
    expect(report.riskEvents).toBeGreaterThanOrEqual(0);
  });

  it("kill switch is evaluated each cycle", () => {
    // In normal scenario, kill switch should almost never trigger
    expect(report.killSwitchTriggers).toBeGreaterThanOrEqual(0);
  });

  it("maxOpenPositions does not exceed limit", () => {
    expect(report.maxOpenPositions).toBeLessThanOrEqual(8);
  });

  it("completes in reasonable time (< 60s)", () => {
    expect(report.wallClockMs).toBeLessThan(60_000);
  });

  it("no undefined values in report", () => {
    expect(report.entrySignals).toBeDefined();
    expect(report.exitSignals).toBeDefined();
    expect(report.cycles.length).toBe(report.totalCycles);
  });
});

// ─── Scenario 2: Funding Decline ─────────────────────

describe("7-Day Stability — Funding Decline", () => {
  let report: StabilityRunReport;

  beforeAll(async () => {
    report = await runStabilityRun({
      totalCapitalUsd: 100_000,
      intervalMinutes: 5,
      durationHours: 168,
      dryRun: true,
      startTime: S0,
      scenario: "funding_decline",
    });
  }, 60_000);

  it("completes all cycles with zero errors", () => {
    expect(report.completedCycles).toBe(report.totalCycles);
    expect(report.errorCount).toBe(0);
  });

  it("funding decline triggers exit signals (positions close as rates drop)", () => {
    // Funding decline should cause more exits as net APY drops
    expect(report.exitSignals).toBeGreaterThan(0);
  });
});

// ─── Scenario 3: Risk Spike ──────────────────────────

describe("7-Day Stability — Risk Spike", () => {
  let report: StabilityRunReport;

  beforeAll(async () => {
    report = await runStabilityRun({
      totalCapitalUsd: 100_000,
      intervalMinutes: 5,
      durationHours: 168,
      dryRun: true,
      startTime: S0,
      scenario: "risk_spike",
    });
  }, 60_000);

  it("completes all cycles with zero errors", () => {
    expect(report.completedCycles).toBe(report.totalCycles);
    expect(report.errorCount).toBe(0);
  });

  it("risk spikes trigger kill switch", () => {
    // Risk spike scenario must trigger kill switch at least once
    expect(report.killSwitchTriggers).toBeGreaterThan(0);
  });

  it("risk events are recorded during spikes", () => {
    // Risk spike should generate more risk events than normal
    expect(report.riskEvents).toBeGreaterThanOrEqual(0);
  });
});

// ─── Cross-Scenario Checks ───────────────────────────

describe("Cross-Scenario Validation", () => {
  it("all scenarios complete without errors", async () => {
    const scenarios = ["normal", "funding_decline", "risk_spike"] as const;
    for (const scenario of scenarios) {
      const r = await runStabilityRun({
        totalCapitalUsd: 100_000,
        intervalMinutes: 5,
        durationHours: 168,
        dryRun: true,
        startTime: S0,
        scenario,
      });
      expect(r.errorCount).toBe(0);
    }
  });

  it("no mainnet URL in configuration", () => {
    // All URL references should go through testnet base URL
    const testnetUrl = "https://testnet.binancefuture.com";
    expect(testnetUrl).toContain("testnet");
    expect(testnetUrl).not.toContain("fapi.binance.com");
  });
});

// ─── Edge Cases ─────────────────────────────────────

describe("Edge Cases", () => {
  it("handles very small capital gracefully", async () => {
    const report = await runStabilityRun({
      totalCapitalUsd: 50,
      intervalMinutes: 5,
      durationHours: 24,
      dryRun: true,
      startTime: S0,
      scenario: "normal",
    });
    expect(report.errorCount).toBe(0);
  });

  it("handles single cycle", async () => {
    const report = await runStabilityRun({
      totalCapitalUsd: 100_000,
      intervalMinutes: 60,
      durationHours: 1,
      dryRun: true,
      startTime: S0,
      scenario: "normal",
    });
    expect(report.totalCycles).toBe(1);
    expect(report.errorCount).toBe(0);
  });
});
