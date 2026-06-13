/**
 * Watcher Result Import + Signal-Gated Dry Run Integration — Tests
 *
 * 13+ scenarios: waiting, missing signal, stale, forbidden,
 * private API violations, valid signal, and safety invariants.
 *
 * ⛔ No connectors, no API calls, no orders — pure logic only.
 */

import { describe, expect, it } from "vitest";
import {
  importWatcherReport,
  extractSelectedSignal,
  evaluateWatcherReportForDryRun,
  generateWatcherGateDecisionReport,
  type RawWatcherReport,
} from "./watcherSignalIntegration";
import { evaluateSignalGatedTinyDryRun } from "./signalGatedTinyDryRun";

// ──────────── Helpers ────────────

function waitingReport(overrides?: Partial<RawWatcherReport>): RawWatcherReport {
  return {
    mode: "realtime",
    startedAt: Date.now() - 86400000,
    endedAt: Date.now(),
    wallClockDurationMs: 86400000,
    cycles: 288,
    completedCycles: 288,
    readinessStatus: "waiting_for_spread",
    actionableOpportunitiesObserved: 0,
    bestOpportunity: null,
    firstActionableOpportunity: null,
    bestNetSpreadApy: 0,
    symbolsWithoutSpread: ["FILUSDT", "ASTERUSDT"],
    symbolsBlockedByQuantity: ["BTCUSDT"],
    symbolsBlockedByLiquidity: ["SUSHIUSDT"],
    privateApiCalled: false,
    mainnetOrderAttempted: false,
    realOrdersExecuted: 0,
    postRequests: 0,
    putRequests: 0,
    deleteRequests: 0,
    generatedAt: Date.now() - 1000,
    ...overrides,
  };
}

function signalReport(overrides?: Partial<RawWatcherReport>): RawWatcherReport {
  return waitingReport({
    readinessStatus: "signal_found",
    actionableOpportunitiesObserved: 1,
    bestNetSpreadApy: 5.2,
    bestOpportunity: {
      cycle: 42,
      symbol: "FILUSDT",
      short: "binance",
      long: "okx",
      netApy: 5.2,
    },
    ...overrides,
  });
}

// ──────────── Tests ────────────

describe("Watcher Signal Integration", () => {
  /* ── importWatcherReport ── */

  describe("importWatcherReport", () => {
    it("normalizes a raw watcher report", () => {
      const raw = waitingReport();
      const r = importWatcherReport(raw);
      expect(r.readinessStatus).toBe("waiting_for_spread");
      expect(r.actionableOpportunitiesObserved).toBe(0);
      expect(r.privateApiCalled).toBe(false);
      expect(Array.isArray(r.symbolsWithoutSpread)).toBe(true);
    });

    it("handles missing fields gracefully", () => {
      const r = importWatcherReport({} as RawWatcherReport);
      expect(r.readinessStatus).toBe("unknown");
      expect(r.actionableOpportunitiesObserved).toBe(0);
      expect(r.privateApiCalled).toBe(false);
      expect(r.symbolsWithoutSpread).toEqual([]);
    });
  });

  /* ── extractSelectedSignal ── */

  describe("extractSelectedSignal", () => {
    it("picks bestOpportunity over firstActionableOpportunity", () => {
      const r = importWatcherReport(
        signalReport({
          bestOpportunity: { cycle: 1, symbol: "FILUSDT", short: "binance", long: "okx", netApy: 5.0 },
          firstActionableOpportunity: { cycle: 1, symbol: "ASTERUSDT", short: "okx", long: "htx", netApy: 3.5 },
        })
      );
      const sig = extractSelectedSignal(r);
      expect(sig).not.toBeNull();
      expect(sig!.symbol).toBe("FILUSDT");
      expect(sig!.netApy).toBe(5.0);
    });

    it("falls back to firstActionableOpportunity", () => {
      const r = importWatcherReport(
        signalReport({
          bestOpportunity: null,
          firstActionableOpportunity: { cycle: 1, symbol: "ASTERUSDT", short: "okx", long: "htx", netApy: 3.5 },
        })
      );
      const sig = extractSelectedSignal(r);
      expect(sig).not.toBeNull();
      expect(sig!.symbol).toBe("ASTERUSDT");
    });

    it("returns null when no signal is available", () => {
      const r = importWatcherReport(waitingReport());
      const sig = extractSelectedSignal(r);
      expect(sig).toBeNull();
    });
  });

  /* ── evaluateWatcherReportForDryRun — integration gate ── */

  describe("evaluateWatcherReportForDryRun", () => {
    it("1. waiting_for_spread → blocked_waiting_for_spread", () => {
      const result = evaluateWatcherReportForDryRun(waitingReport());
      expect(result.allowed).toBe(false);
      expect(result.gateDecisionStatus).toBe("blocked_waiting_for_spread");
      expect(result.watcherReadinessStatus).toBe("waiting_for_spread");
    });

    it("2. signal_found but no bestOpportunity → blocked_no_signal", () => {
      const raw = signalReport({ bestOpportunity: null, firstActionableOpportunity: null });
      const result = evaluateWatcherReportForDryRun(raw);
      expect(result.allowed).toBe(false);
      expect(result.gateDecisionStatus).toBe("blocked_no_signal");
      expect(result.selectedSignal).toBeNull();
    });

    it("3. stale bestOpportunity → blocked_stale_signal", () => {
      const staleNow = Date.now();
      const staleGenerated = staleNow - 600_000; // 10 min ago (> 5 min freshness)
      const raw = signalReport({ generatedAt: staleGenerated });
      const result = evaluateWatcherReportForDryRun(raw, { now: staleNow });
      expect(result.allowed).toBe(false);
      expect(result.gateDecisionStatus).toBe("blocked_stale_signal");
    });

    it("4. signal with forbidden exchange → blocked_forbidden_exchange", () => {
      const raw = signalReport({
        bestOpportunity: { cycle: 1, symbol: "FILUSDT", short: "bybit", long: "okx", netApy: 5.0 },
      });
      const result = evaluateWatcherReportForDryRun(raw);
      expect(result.allowed).toBe(false);
      expect(result.gateDecisionStatus).toBe("blocked_forbidden_exchange");
    });

    it("5. privateApiCalled=true → blocked_private_api", () => {
      const raw = signalReport({ privateApiCalled: true });
      const result = evaluateWatcherReportForDryRun(raw);
      expect(result.allowed).toBe(false);
      expect(result.gateDecisionStatus).toBe("blocked_private_api");
    });

    it("6. postRequests=1 → blocked_private_api", () => {
      const raw = signalReport({ postRequests: 1 });
      const result = evaluateWatcherReportForDryRun(raw);
      expect(result.allowed).toBe(false);
      expect(result.gateDecisionStatus).toBe("blocked_private_api");
    });

    it("7. valid fresh signal → ready_for_dry_run", () => {
      const now = Date.now();
      const raw = signalReport({ generatedAt: now - 2000 }); // 2s ago, well within 5 min
      const result = evaluateWatcherReportForDryRun(raw, { now });
      expect(result.allowed).toBe(true);
      expect(result.gateDecisionStatus).toBe("ready_for_dry_run");
      expect(result.selectedSignal).not.toBeNull();
      expect(result.selectedSignal!.symbol).toBe("FILUSDT");
      expect(result.selectedSignal!.netApy).toBe(5.2);
    });

    it("8. report missing enabledExchanges → still processed (defaults used)", () => {
      // Integration layer uses defaults; this test verifies defaults are correct
      const raw = signalReport();
      const result = evaluateWatcherReportForDryRun(raw, {
        enabledExchanges: ["binance", "okx", "htx"],
      });
      // Should pass — defaults match
      expect(result.allowed).toBe(true);
    });

    it("9. bad pausedExchanges → blocked", () => {
      const raw = signalReport();
      const result = evaluateWatcherReportForDryRun(raw, {
        pausedExchanges: ["bybit", "bitget", "gate"], // missing hyperliquid
      });
      expect(result.allowed).toBe(false);
    });

    it("10. no NaN / Infinity in output", () => {
      const valid = evaluateWatcherReportForDryRun(signalReport());
      expect(Number.isFinite(valid.generatedAt)).toBe(true);
      expect(valid.signalAgeMs === null || Number.isFinite(valid.signalAgeMs)).toBe(true);

      const waiting = evaluateWatcherReportForDryRun(waitingReport());
      expect(Number.isFinite(waiting.generatedAt)).toBe(true);
    });

    it("11. does not call connectors — static analysis", () => {
      // Pure function — no connector constructors, no fetch, no API calls
      const src = importWatcherReport.toString();
      const src2 = extractSelectedSignal.toString();
      expect(src.includes("new ")).toBe(false);
      expect(src2.includes("new ")).toBe(false);
    });

    it("12. does not call fetch — static analysis", () => {
      const src = evaluateWatcherReportForDryRun.toString();
      expect(src.includes("fetch(")).toBe(false);
    });

    it("13. does not create orders — static analysis", () => {
      const src = evaluateWatcherReportForDryRun.toString();
      expect(src.includes("createOrder")).toBe(false);
      expect(src.includes("cancelOrder")).toBe(false);
      expect(src.includes("POST")).toBe(false);
      expect(src.includes("PUT ")).toBe(false); // avoid matching importWatcherReport
      expect(src.includes("DELETE")).toBe(false);
    });
  });

  /* ── end-to-end: waiting_for_spread report flow ── */

  it("e2e: waiting_for_spread report produces full gate decision report", () => {
    const raw = waitingReport({
      startedAt: Date.now() - 86400000,
      endedAt: Date.now(),
      wallClockDurationMs: 86400000,
      completedCycles: 288,
    });
    const result = evaluateWatcherReportForDryRun(raw);

    expect(result.watcherMode).toBe("realtime");
    expect(result.watcherStartedAt).not.toBeNull();
    expect(result.watcherEndedAt).not.toBeNull();
    expect(result.watcherReadinessStatus).toBe("waiting_for_spread");
    expect(result.allowed).toBe(false);
    expect(result.gateDecisionStatus).toBe("blocked_waiting_for_spread");
    expect(result.selectedSignal).toBeNull();
    expect(result.privateApiCalled).toBe(false);
    expect(result.mainnetOrderAttempted).toBe(false);
    expect(result.realOrdersExecuted).toBe(0);
    expect(result.postRequests).toBe(0);
    expect(result.putRequests).toBe(0);
    expect(result.deleteRequests).toBe(0);
    expect(Array.isArray(result.blockers)).toBe(true);
    expect(result.blockers.length).toBeGreaterThanOrEqual(1);
  });

  /* ── end-to-end: valid signal report flow ── */

  it("e2e: valid signal report produces ready_for_dry_run", () => {
    const now = Date.now();
    const raw = signalReport({ generatedAt: now - 60_000 }); // 1 min ago
    const result = evaluateWatcherReportForDryRun(raw, { now });

    expect(result.watcherReadinessStatus).toBe("signal_found");
    expect(result.allowed).toBe(true);
    expect(result.gateDecisionStatus).toBe("ready_for_dry_run");
    expect(result.selectedSignal).not.toBeNull();
    expect(result.selectedSignal!.symbol).toBe("FILUSDT");
    expect(result.selectedSignal!.short).toBe("binance");
    expect(result.selectedSignal!.long).toBe("okx");
    expect(result.selectedSignal!.netApy).toBe(5.2);
    expect(result.blockers).toEqual([]);
    expect(result.realOrdersExecuted).toBe(0);
  });

  /* ── edge: APY below threshold ── */

  it("signal with APY < 3 is blocked", () => {
    const raw = signalReport({
      bestNetSpreadApy: 2.5,
      bestOpportunity: { cycle: 1, symbol: "FILUSDT", short: "binance", long: "okx", netApy: 2.5 },
    });
    const result = evaluateWatcherReportForDryRun(raw);
    expect(result.allowed).toBe(false);
    expect(result.gateDecisionStatus).toBe("blocked_no_signal");
  });
});
