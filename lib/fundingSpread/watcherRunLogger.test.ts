/**
 * Watcher Persistent Run Logger — Tests
 *
 * Verifies every output file is created with correct structure,
 * content is parseable JSON, and no trading API is called.
 *
 * ⛔ No connectors, no API calls, no order placement.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  WatcherRunLogger,
  generateRunId,
  getBaseDir,
  type RunConfig,
} from "./watcherRunLogger";

// ──────────── Helpers ────────────

const TEST_THRESHOLDS = {
  minNetSpreadApy: 3,
  maxNotionalMismatchPercent: 1,
  min24hVolumeUsd: 10_000_000,
  requireSignalFreshnessMs: 5 * 60 * 1000,
};

function makeConfig(overrides?: Partial<RunConfig>): RunConfig {
  return {
    runId: generateRunId(),
    mode: "realtime",
    startedAt: Date.now() - 60_000,
    expectedEndedAt: Date.now() + 86_400_000 - 60_000,
    enabledExchanges: ["binance", "okx", "htx"],
    pausedExchanges: ["bybit", "bitget", "gate", "hyperliquid"],
    symbols: ["BTCUSDT", "ETHUSDT", "FILUSDT", "ASTERUSDT"],
    thresholds: TEST_THRESHOLDS,
    intervalMs: 300_000,
    totalCycles: 288,
    realOrdersExecuted: 0,
    postRequests: 0,
    putRequests: 0,
    deleteRequests: 0,
    ...overrides,
  };
}

const BASE = getBaseDir();

function cycleRecord(overrides?: Record<string, unknown>) {
  return {
    cycle: 0, totalCycles: 288, timestamp: Date.now(),
    symbolsChecked: 4,
    fundingSnapshotsExpected: 12, fundingSnapshotsWritten: 12,
    fundingReadsOk: 12, fundingReadsFailed: 0,
    viableCandidates: 2, actionableOpportunities: 0,
    bestNetSpreadApy: 0, readinessStatus: "waiting_for_spread",
    degradedExchanges: [] as string[],
    errorBreakdownByExchange: {} as Record<string, number>,
    errorBreakdownByReason: {} as Record<string, number>,
    totalErrors: 0,
    privateApiCalled: false, mainnetOrderAttempted: false,
    realOrdersExecuted: 0, postRequests: 0, putRequests: 0, deleteRequests: 0,
    ...overrides,
  };
}

function snapshotRecord(overrides?: Record<string, unknown>) {
  return {
    cycle: 0, timestamp: Date.now(),
    exchangeId: "binance", symbol: "BTCUSDT", exchangeSymbol: "BTCUSDT",
    fundingRate: 0.00009, fundingIntervalHours: 8,
    nextFundingTime: Date.now() + 8 * 3600_000,
    markPrice: 64000, source: "exchange_api", endpoint: "getFundingInfo",
    httpStatus: 200, errorCode: null, errorMessage: null,
    retryCount: 0, latencyMs: 120,
    readOk: true,
    ...overrides,
  };
}

function candidateRecord(overrides?: Record<string, unknown>) {
  return {
    cycle: 0, timestamp: Date.now(),
    symbol: "FILUSDT", targetNotionalUsd: 10,
    quantityNormalizationPassed: true, liquidityGuardPassed: true,
    fundingOpportunityFound: false, netSpreadApy: 0,
    blockerReason: null,
    ...overrides,
  };
}

function signalRecord(overrides?: Record<string, unknown>) {
  return {
    cycle: 42, timestamp: Date.now(),
    symbol: "BTCUSDT", shortExchange: "okx", longExchange: "binance",
    spreadRate: 0.0036, spreadApy: 3.94, netSpreadApy: 3.9,
    targetNotionalUsd: 100,
    quantityNormalizationPassed: true, liquidityGuardPassed: true,
    signalFreshUntil: Date.now() + 300_000,
    action: "signal_only_no_trade" as const,
    ...overrides,
  };
}

// ──────────── Tests ────────────

describe("WatcherRunLogger", () => {
  let logger: WatcherRunLogger;
  let config: RunConfig;

  beforeEach(() => {
    config = makeConfig();
    logger = new WatcherRunLogger(config);
  });

  afterEach(() => {
    if (logger && fs.existsSync(logger.directory)) {
      fs.rmSync(logger.directory, { recursive: true, force: true });
    }
  });

  /* ── 1. Logger creates run directory ── */

  it("1. creates run directory with all expected files", () => {
    expect(fs.existsSync(logger.directory)).toBe(true);
    expect(fs.existsSync(path.join(logger.directory, "run.json"))).toBe(true);
    expect(fs.existsSync(path.join(logger.directory, "signals.jsonl"))).toBe(true);
  });

  /* ── 2. run.json is correct ── */

  it("2. writes correct run.json", () => {
    const run = JSON.parse(fs.readFileSync(path.join(logger.directory, "run.json"), "utf8"));
    expect(run.runId).toBe(config.runId);
    expect(run.mode).toBe("realtime");
    expect(run.enabledExchanges).toEqual(["binance", "okx", "htx"]);
    expect(run.pausedExchanges).toEqual(expect.arrayContaining(["bybit", "bitget", "gate", "hyperliquid"]));
    expect(run.totalCycles).toBe(288);
    expect(run.realOrdersExecuted).toBe(0);
  });

  /* ── 3. cycles.jsonl append ── */

  it("3. appends one line per cycle to cycles.jsonl", () => {
    for (let c = 0; c < 5; c++) {
      logger.logCycle(cycleRecord({ cycle: c }));
    }
    const lines = fs.readFileSync(path.join(logger.directory, "cycles.jsonl"), "utf8").trim().split("\n");
    expect(lines.length).toBe(5);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.runId).toBe(config.runId);
    expect(parsed.cycle).toBe(0);
    expect(parsed.viableCandidates).toBe(2);
    expect(Array.isArray(parsed.degradedExchanges)).toBe(true);
    expect(typeof parsed.errorBreakdownByExchange).toBe("object");
  });

  /* ── 4. funding-snapshots.jsonl append ── */

  it("4. appends funding snapshots with source and latency", () => {
    logger.logFundingSnapshot(snapshotRecord());
    const lines = fs.readFileSync(path.join(logger.directory, "funding-snapshots.jsonl"), "utf8").trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.exchangeId).toBe("binance");
    expect(parsed.fundingRate).toBe(0.00009);
    expect(parsed.source).toBe("exchange_api");
    expect(parsed.latencyMs).toBe(120);
    expect(parsed.httpStatus).toBe(200);
    expect(parsed.readOk).toBe(true);
  });

  /* ── 5. candidates.jsonl append ── */

  it("5. appends candidate evaluations", () => {
    logger.logCandidate(candidateRecord());
    const lines = fs.readFileSync(path.join(logger.directory, "candidates.jsonl"), "utf8").trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.symbol).toBe("FILUSDT");
    expect(parsed.quantityNormalizationPassed).toBe(true);
  });

  /* ── 6. signals.jsonl append ── */

  it("6. appends actionable signals to signals.jsonl", () => {
    logger.logSignal(signalRecord());
    const lines = fs.readFileSync(path.join(logger.directory, "signals.jsonl"), "utf8").trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.symbol).toBe("BTCUSDT");
    expect(parsed.action).toBe("signal_only_no_trade");
  });

  /* ── 7. signals.jsonl exists empty when no signals ── */

  it("7. signals.jsonl exists empty when no signal logged", () => {
    const content = fs.readFileSync(path.join(logger.directory, "signals.jsonl"), "utf8");
    expect(content).toBe("");
  });

  /* ── 8. JSONL lines are parseable mid-run ── */

  it("8. can read partial JSONL mid-run without finalize", () => {
    logger.logCycle(cycleRecord({ cycle: 0 }));
    logger.logFundingSnapshot(snapshotRecord());

    const cycles = fs.readFileSync(path.join(logger.directory, "cycles.jsonl"), "utf8").trim().split("\n");
    const snaps = fs.readFileSync(path.join(logger.directory, "funding-snapshots.jsonl"), "utf8").trim().split("\n");
    expect(() => JSON.parse(cycles[0])).not.toThrow();
    expect(() => JSON.parse(snaps[0])).not.toThrow();
  });

  /* ── 9. summary.json on finalize ── */

  it("9. writes summary.json on finalize", () => {
    logger.logCycle(cycleRecord({ cycle: 0 }));
    logger.logCandidate(candidateRecord());
    const summary = logger.finalize();
    expect(summary.runId).toBe(config.runId);
    expect(summary.completedCycles).toBe(288);
    expect(summary.realOrdersExecuted).toBe(0);
    expect(summary.readinessStatus).toBe("waiting_for_spread");
    expect(fs.existsSync(path.join(logger.directory, "summary.json"))).toBe(true);
  });

  /* ── 10. summary reflects signals ── */

  it("10. summary reflects signals when present", () => {
    logger.logSignal(signalRecord());
    const summary = logger.finalize();
    expect(summary.actionableOpportunitiesObserved).toBe(1);
    expect(summary.readinessStatus).toBe("signal_found");
    expect(summary.bestOpportunity).not.toBeNull();
    expect(summary.bestOpportunity!.symbol).toBe("BTCUSDT");
  });

  /* ── 11. All JSON lines parseable ── */

  it("11. all JSONL lines are parseable", () => {
    logger.logCycle(cycleRecord({ cycle: 0 }));
    logger.logFundingSnapshot(snapshotRecord());
    logger.logCandidate(candidateRecord());

    for (const file of ["cycles.jsonl", "funding-snapshots.jsonl", "candidates.jsonl"]) {
      const content = fs.readFileSync(path.join(logger.directory, file), "utf8").trim();
      if (content === "") continue;
      for (const line of content.split("\n")) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    }
  });

  /* ── 12. No NaN / Infinity ── */

  it("12. no NaN or Infinity in any serialized record", () => {
    logger.logCycle(cycleRecord({ cycle: 0 }));
    const content = fs.readFileSync(path.join(logger.directory, "cycles.jsonl"), "utf8");
    expect(content.includes("NaN")).toBe(false);
    expect(content.includes("Infinity")).toBe(false);
  });

  /* ── 13. generateRunId produces unique IDs ── */

  it("13. generateRunId produces unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(generateRunId());
    expect(ids.size).toBe(100);
  });

  /* ── 14. runId in all records ── */

  it("14. every JSONL record includes runId", () => {
    logger.logCycle(cycleRecord({ cycle: 0 }));
    logger.logFundingSnapshot(snapshotRecord());
    logger.logCandidate(candidateRecord());
    logger.logSignal(signalRecord());

    for (const file of ["cycles.jsonl", "funding-snapshots.jsonl", "candidates.jsonl", "signals.jsonl"]) {
      const content = fs.readFileSync(path.join(logger.directory, file), "utf8").trim();
      if (content === "") continue;
      for (const line of content.split("\n")) {
        const parsed = JSON.parse(line);
        expect(parsed.runId).toBe(config.runId);
      }
    }
  });

  /* ── 15. static check: no API calls ── */

  it("15. source does not contain connector/API/order references", () => {
    const src = fs.readFileSync("lib/fundingSpread/watcherRunLogger.ts", "utf8");
    expect(src.includes("RealBinanceConnector")).toBe(false);
    expect(src.includes("RealOkxConnector")).toBe(false);
    expect(src.includes("RealHtxConnector")).toBe(false);
    expect(src.includes("createOrder")).toBe(false);
    expect(src.includes("cancelOrder")).toBe(false);
    expect(src.includes("fetch(")).toBe(false);
    expect(src.includes("axios")).toBe(false);
  });

  /* ── 16. failed read does not write fundingRate=0 as success ── */

  it("16. failed read can write fundingRate=null and readOk=false", () => {
    logger.logFundingSnapshot(snapshotRecord({
      fundingRate: null,
      markPrice: null,
      readOk: false,
      source: "fallback_zero",
      httpStatus: 0,
      errorCode: "NETWORK_ERROR",
      errorMessage: "Connection timeout",
      latencyMs: 30000,
    }));

    const lines = fs.readFileSync(path.join(logger.directory, "funding-snapshots.jsonl"), "utf8").trim().split("\n");
    const parsed = JSON.parse(lines[0]);
    expect(parsed.fundingRate).toBeNull();
    expect(parsed.readOk).toBe(false);
    expect(parsed.source).toBe("fallback_zero");
    expect(parsed.errorCode).toBe("NETWORK_ERROR");
  });

  /* ── 17. counts match between cycle record and JSONL ── */

  it("17. funding snapshot counts in cycle match written JSONL", () => {
    const expected = 12;
    for (let c = 0; c < 3; c++) {
      logger.logCycle(cycleRecord({
        cycle: c,
        fundingSnapshotsExpected: expected,
        fundingSnapshotsWritten: expected,
      }));
      for (let i = 0; i < expected; i++) {
        logger.logFundingSnapshot(snapshotRecord({ cycle: c }));
      }
    }

    const cycles = fs.readFileSync(path.join(logger.directory, "cycles.jsonl"), "utf8").trim().split("\n").filter(Boolean);
    const snaps = fs.readFileSync(path.join(logger.directory, "funding-snapshots.jsonl"), "utf8").trim().split("\n").filter(Boolean);

    expect(cycles.length).toBe(3);
    expect(snaps.length).toBe(3 * expected);
  });

  /* ── 18. degradedExchanges is an array ── */

  it("18. degradedExchanges is always an array", () => {
    logger.logCycle(cycleRecord({ degradedExchanges: ["binance"], totalErrors: 3 }));
    const lines = fs.readFileSync(path.join(logger.directory, "cycles.jsonl"), "utf8").trim().split("\n");
    const parsed = JSON.parse(lines[0]);
    expect(Array.isArray(parsed.degradedExchanges)).toBe(true);
    expect(parsed.degradedExchanges).toEqual(["binance"]);
  });

  /* ── 19. errorBreakdown fields ── */

  it("19. errorBreakdownByExchange and ByReason are recorded", () => {
    logger.logCycle(cycleRecord({
      errorBreakdownByExchange: { binance: 2, okx: 1 },
      errorBreakdownByReason: { timeout: 2, rate_limit: 1 },
      totalErrors: 3,
    }));
    const lines = fs.readFileSync(path.join(logger.directory, "cycles.jsonl"), "utf8").trim().split("\n");
    const parsed = JSON.parse(lines[0]);
    expect(parsed.errorBreakdownByExchange).toEqual({ binance: 2, okx: 1 });
    expect(parsed.errorBreakdownByReason).toEqual({ timeout: 2, rate_limit: 1 });
    expect(parsed.totalErrors).toBe(3);
  });

  /* ── 20. finalize is idempotent ── */

  it("20. finalize is idempotent", () => {
    const s1 = logger.finalize();
    const s2 = logger.finalize();
    expect(s1.runId).toBe(s2.runId);
    expect(s1.endedAt).toBe(s2.endedAt);
  });
});
