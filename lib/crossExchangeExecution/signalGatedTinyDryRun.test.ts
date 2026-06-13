/**
 * Signal-Gated Mainnet Tiny Dry Run Framework — Tests
 *
 * 15 scenarios verifying every gate rule.
 * No connectors, no API calls — pure logic.
 */

import { describe, expect, it } from "vitest";
import {
  evaluateSignalGatedTinyDryRun,
  buildSignalGatedDryRunDecision,
  type WatcherReport,
  type WatcherActionableSignal,
  type SignalGatedTinyDryRunInput,
} from "./signalGatedTinyDryRun";

// ──────────── Helpers ────────────

const FRESH_MS = 5 * 60 * 1000;

function validSignal(overrides?: Partial<WatcherActionableSignal>): WatcherActionableSignal {
  return {
    cycle: 42,
    symbol: "FILUSDT",
    short: "binance",
    long: "okx",
    netApy: 5.2,
    ...overrides,
  };
}

function waitingReport(overrides?: Partial<WatcherReport>): WatcherReport {
  return {
    readinessStatus: "waiting_for_spread",
    actionableOpportunitiesObserved: 0,
    bestOpportunity: undefined,
    firstActionableOpportunity: undefined,
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

function signalReport(overrides?: Partial<WatcherReport>): WatcherReport {
  return waitingReport({
    readinessStatus: "signal_found",
    actionableOpportunitiesObserved: 1,
    bestNetSpreadApy: 5.2,
    ...overrides,
  });
}

function validInput(overrides?: Partial<SignalGatedTinyDryRunInput>): SignalGatedTinyDryRunInput {
  return {
    watcherReport: signalReport(),
    selectedSignal: validSignal(),
    enabledExchanges: ["binance", "okx", "htx"],
    pausedExchanges: ["bybit", "bitget", "gate", "hyperliquid"],
    maxPositionUsd: 50,
    maxCapitalUsd: 200,
    requireSignalFreshnessMs: FRESH_MS,
    now: Date.now(),
    ...overrides,
  };
}

// ──────────── Tests ────────────

describe("Signal-Gated Tiny Dry Run", () => {
  it("1. waiting_for_spread → blocked_waiting_for_spread", () => {
    const result = evaluateSignalGatedTinyDryRun(
      validInput({ watcherReport: waitingReport() })
    );
    expect(result.allowed).toBe(false);
    expect(result.status).toBe("blocked_waiting_for_spread");
    expect(result.blockers.length).toBeGreaterThanOrEqual(1);
    expect(result.blockers.some((b) => b.includes("readinessStatus"))).toBe(true);
  });

  it("2. signal_found but no selectedSignal → blocked_no_signal", () => {
    const result = evaluateSignalGatedTinyDryRun(
      validInput({ selectedSignal: null })
    );
    expect(result.allowed).toBe(false);
    expect(result.status).toBe("blocked_no_signal");
    expect(result.blockers.some((b) => b.includes("No selected signal"))).toBe(true);
  });

  it("3. stale signal → blocked_stale_signal", () => {
    const staleNow = Date.now();
    const staleGenerated = staleNow - FRESH_MS - 1000; // 1s past freshness
    const result = evaluateSignalGatedTinyDryRun(
      validInput({
        watcherReport: signalReport({ generatedAt: staleGenerated }),
        now: staleNow,
      })
    );
    expect(result.allowed).toBe(false);
    expect(result.status).toBe("blocked_stale_signal");
    expect(result.blockers.some((b) => b.includes("exceeds max freshness"))).toBe(true);
  });

  it("4. signal with forbidden exchange → blocked_forbidden_exchange", () => {
    const result = evaluateSignalGatedTinyDryRun(
      validInput({ selectedSignal: validSignal({ short: "bybit" }) })
    );
    expect(result.allowed).toBe(false);
    expect(result.status).toBe("blocked_forbidden_exchange");
    expect(result.blockers.some((b) => b.includes("Exchange pair"))).toBe(true);
  });

  it("5. signal netSpreadApy < 3 → blocked_no_signal", () => {
    const result = evaluateSignalGatedTinyDryRun(
      validInput({ selectedSignal: validSignal({ netApy: 2.1 }) })
    );
    expect(result.allowed).toBe(false);
    expect(result.status).toBe("blocked_no_signal");
    expect(result.blockers.some((b) => b.includes("netSpreadApy") && b.includes("< 3"))).toBe(true);
  });

  it("6. signal netSpreadApy is NaN → blocked (covers not-finite)", () => {
    const result = evaluateSignalGatedTinyDryRun(
      validInput({ selectedSignal: validSignal({ netApy: NaN }) })
    );
    expect(result.allowed).toBe(false);
    expect(result.blockers.some((b) => b.includes("netSpreadApy"))).toBe(true);
  });

  it("7. signal with paused exchange (bitget) → blocked_forbidden_exchange", () => {
    const result = evaluateSignalGatedTinyDryRun(
      validInput({ selectedSignal: validSignal({ long: "bitget" }) })
    );
    expect(result.allowed).toBe(false);
    expect(result.status).toBe("blocked_forbidden_exchange");
  });

  it("8. privateApiCalled=true → blocked_private_api", () => {
    const result = evaluateSignalGatedTinyDryRun(
      validInput({ watcherReport: signalReport({ privateApiCalled: true }) })
    );
    expect(result.allowed).toBe(false);
    expect(result.status).toBe("blocked_private_api");
    expect(result.blockers.some((b) => b.includes("private API"))).toBe(true);
  });

  it("9. mainnetOrderAttempted=true → blocked_private_api", () => {
    const result = evaluateSignalGatedTinyDryRun(
      validInput({ watcherReport: signalReport({ mainnetOrderAttempted: true }) })
    );
    expect(result.allowed).toBe(false);
    expect(result.status).toBe("blocked_private_api");
  });

  it("10. realOrdersExecuted=3 → blocked_private_api", () => {
    const result = evaluateSignalGatedTinyDryRun(
      validInput({ watcherReport: signalReport({ realOrdersExecuted: 3 }) })
    );
    expect(result.allowed).toBe(false);
    expect(result.status).toBe("blocked_private_api");
  });

  it("11. POST=1 → blocked_private_api", () => {
    const result = evaluateSignalGatedTinyDryRun(
      validInput({ watcherReport: signalReport({ postRequests: 1 }) })
    );
    expect(result.allowed).toBe(false);
    expect(result.status).toBe("blocked_private_api");
  });

  it("12. valid signal → ready_for_dry_run", () => {
    const result = evaluateSignalGatedTinyDryRun(validInput());
    expect(result.allowed).toBe(true);
    expect(result.status).toBe("ready_for_dry_run");
    expect(result.selectedSymbol).toBe("FILUSDT");
    expect(result.shortExchange).toBe("binance");
    expect(result.longExchange).toBe("okx");
    expect(result.netSpreadApy).toBe(5.2);
    expect(result.blockers).toEqual([]);
  });

  it("13. no NaN / Infinity in decision", () => {
    const result = evaluateSignalGatedTinyDryRun(validInput());
    expect(Number.isFinite(result.netSpreadApy)).toBe(true);
    expect(Number.isFinite(result.generatedAt)).toBe(true);
  });

  it("14. enabledExchanges must be [binance, okx, htx]", () => {
    const result = evaluateSignalGatedTinyDryRun(
      validInput({ enabledExchanges: ["binance", "okx", "bybit"] })
    );
    expect(result.allowed).toBe(false);
    expect(result.blockers.some((b) => b.includes("enabledExchanges"))).toBe(true);
  });

  it("15. pausedExchanges must include all four paused exchanges", () => {
    const result = evaluateSignalGatedTinyDryRun(
      validInput({ pausedExchanges: ["bybit", "bitget", "gate"] })
    );
    expect(result.allowed).toBe(false);
    expect(result.blockers.some((b) => b.includes("pausedExchanges"))).toBe(true);
  });

  // ──── Additional edge cases ────

  it("maxPositionUsd exceeds maxCapitalUsd → blocked_risk", () => {
    const result = evaluateSignalGatedTinyDryRun(
      validInput({ maxPositionUsd: 300, maxCapitalUsd: 200 })
    );
    expect(result.allowed).toBe(false);
    expect(result.blockers.some((b) => b.includes("exceeds maxCapitalUsd"))).toBe(true);
  });

  it("buildSignalGatedDryRunDecision convenience works for valid signal", () => {
    const report = signalReport();
    const signal = validSignal();
    const result = buildSignalGatedDryRunDecision(report, signal);
    expect(result.allowed).toBe(true);
    expect(result.status).toBe("ready_for_dry_run");
  });

  it("buildSignalGatedDryRunDecision blocks when signal is null", () => {
    const report = signalReport();
    const result = buildSignalGatedDryRunDecision(report, null);
    expect(result.allowed).toBe(false);
    expect(result.status).toBe("blocked_no_signal");
  });

  it("buildSignalGatedDryRunDecision blocks waiting_for_spread report", () => {
    const report = waitingReport();
    const result = buildSignalGatedDryRunDecision(report, null);
    expect(result.allowed).toBe(false);
    expect(result.status).toBe("blocked_waiting_for_spread");
  });
});
