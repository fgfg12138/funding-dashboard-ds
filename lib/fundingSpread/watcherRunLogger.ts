/**
 * Watcher Persistent Run Logger
 *
 * Writes structured JSONL logs for every cycle, funding snapshot,
 * candidate evaluation, and signal — to disk at data/watcher-runs/<runId>/.
 *
 * ⛔ No connectors, no API calls, no order placement.
 */

import * as fs from "fs";
import * as path from "path";

// ──────────── Types ────────────

export type RunConfig = {
  runId: string;
  mode: "realtime";
  startedAt: number;
  expectedEndedAt: number;
  enabledExchanges: string[];
  pausedExchanges: string[];
  symbols: string[];
  thresholds: {
    minNetSpreadApy: number;
    maxNotionalMismatchPercent: number;
    min24hVolumeUsd: number;
    requireSignalFreshnessMs: number;
  };
  intervalMs: number;
  totalCycles: number;
  realOrdersExecuted: number;
  postRequests: number;
  putRequests: number;
  deleteRequests: number;
};

export type CycleRecord = {
  runId: string;
  cycle: number;
  totalCycles: number;
  timestamp: number;
  symbolsChecked: number;
  /** How many funding snapshots we expected to write this cycle (exchanges × symbols) */
  fundingSnapshotsExpected: number;
  /** How many funding snapshots were actually appended to JSONL */
  fundingSnapshotsWritten: number;
  /** How many individual exchange reads succeeded */
  fundingReadsOk: number;
  /** How many individual exchange reads failed */
  fundingReadsFailed: number;
  viableCandidates: number;
  actionableOpportunities: number;
  bestNetSpreadApy: number;
  readinessStatus: string;
  /** Which exchanges had errors this cycle */
  degradedExchanges: string[];
  /** Error count breakdown by exchange */
  errorBreakdownByExchange: Record<string, number>;
  /** Error count breakdown by reason category */
  errorBreakdownByReason: Record<string, number>;
  totalErrors: number;
  privateApiCalled: boolean;
  mainnetOrderAttempted: boolean;
  realOrdersExecuted: number;
  postRequests: number;
  putRequests: number;
  deleteRequests: number;
};

export type FundingSnapshotRecord = {
  runId: string;
  cycle: number;
  timestamp: number;
  exchangeId: string;
  symbol: string;
  exchangeSymbol: string;
  /** null when read failed; 0 is a valid real funding rate */
  fundingRate: number | null;
  fundingIntervalHours: number;
  nextFundingTime: number | null;
  /** The mark price from THIS exchange (NOT shared) */
  markPrice: number | null;
  /** What provided the mark price data */
  source: "exchange_api" | "fallback_previous" | "fallback_zero";
  /** The API endpoint called */
  endpoint: string;
  /** HTTP status code; 0 if network error */
  httpStatus: number;
  /** Error code from exchange if any */
  errorCode: string | null;
  /** Human-readable error message */
  errorMessage: string | null;
  /** How many retries were attempted */
  retryCount: number;
  /** API call duration in ms */
  latencyMs: number;
  /** true ONLY if data was successfully received from the exchange */
  readOk: boolean;
};

export type CandidateRecord = {
  runId: string;
  cycle: number;
  timestamp: number;
  symbol: string;
  targetNotionalUsd: number;
  quantityNormalizationPassed: boolean;
  liquidityGuardPassed: boolean;
  fundingOpportunityFound: boolean;
  netSpreadApy: number;
  blockerReason: string | null;
};

export type SignalRecord = {
  runId: string;
  cycle: number;
  timestamp: number;
  symbol: string;
  shortExchange: string;
  longExchange: string;
  spreadRate: number;
  spreadApy: number;
  netSpreadApy: number;
  targetNotionalUsd: number;
  quantityNormalizationPassed: boolean;
  liquidityGuardPassed: boolean;
  signalFreshUntil: number;
  action: "signal_only_no_trade";
};

export type Summary = {
  runId: string;
  startedAt: number;
  endedAt: number;
  wallClockDurationMs: number;
  completedCycles: number;
  symbolsChecked: number;
  fundingSnapshotsExpected: number;
  fundingSnapshotsWritten: number;
  fundingReadsOk: number;
  fundingReadsFailed: number;
  viableCandidatesObserved: number;
  actionableOpportunitiesObserved: number;
  bestOpportunity: {
    symbol: string;
    short: string;
    long: string;
    netApy: number;
  } | null;
  bestNetSpreadApy: number;
  readinessStatus: string;
  degradedCycles: number;
  errors: number;
  realOrdersExecuted: number;
  postRequests: number;
  putRequests: number;
  deleteRequests: number;
};

// ──────────── Appender ────────────

function appendJsonl(dir: string, file: string, record: unknown): void {
  const line = JSON.stringify(record) + "\n";
  fs.appendFileSync(path.join(dir, file), line, "utf8");
}

function writeJson(dir: string, file: string, data: unknown): void {
  fs.writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2), "utf8");
}

// ──────────── Logger ────────────

const BASE_DIR = path.resolve(process.cwd(), "data", "watcher-runs");

export class WatcherRunLogger {
  readonly runId: string;
  readonly dir: string;
  readonly config: RunConfig;
  private _startedAt: number;
  private _totalFundingSnapshotsExpected = 0;
  private _totalFundingSnapshotsWritten = 0;
  private _totalFundingReadsOk = 0;
  private _totalFundingReadsFailed = 0;
  private _viableCount = 0;
  private _actionableCount = 0;
  private _degradedCycles = 0;
  private _errorCount = 0;
  private _bestApy = 0;
  private _bestOpp: { symbol: string; short: string; long: string; netApy: number } | null = null;
  private _completed = false;

  constructor(config: RunConfig) {
    this.runId = config.runId;
    this.config = config;
    this._startedAt = config.startedAt;
    this.dir = path.join(BASE_DIR, config.runId);

    fs.mkdirSync(this.dir, { recursive: true });
    writeJson(this.dir, "run.json", this.config);
    fs.writeFileSync(path.join(this.dir, "signals.jsonl"), "", "utf8");
  }

  /** Record one cycle snapshot */
  logCycle(record: Omit<CycleRecord, "runId">): void {
    appendJsonl(this.dir, "cycles.jsonl", { runId: this.runId, ...record });
    this._totalFundingSnapshotsExpected += record.fundingSnapshotsExpected;
    this._totalFundingSnapshotsWritten += record.fundingSnapshotsWritten;
    this._totalFundingReadsOk += record.fundingReadsOk;
    this._totalFundingReadsFailed += record.fundingReadsFailed;
    if (record.degradedExchanges.length > 0) this._degradedCycles++;
    this._errorCount += record.totalErrors;
    if (record.bestNetSpreadApy > this._bestApy) {
      this._bestApy = record.bestNetSpreadApy;
    }
  }

  /** Record one funding snapshot per exchange per symbol */
  logFundingSnapshot(record: Omit<FundingSnapshotRecord, "runId">): void {
    appendJsonl(this.dir, "funding-snapshots.jsonl", { runId: this.runId, ...record });
  }

  /** Record one candidate evaluation per symbol per cycle */
  logCandidate(record: Omit<CandidateRecord, "runId">): void {
    appendJsonl(this.dir, "candidates.jsonl", { runId: this.runId, ...record });
    if (record.quantityNormalizationPassed && record.liquidityGuardPassed) {
      this._viableCount++;
    }
  }

  /** Record one actionable signal (append to signals.jsonl) */
  logSignal(record: Omit<SignalRecord, "runId">): void {
    appendJsonl(this.dir, "signals.jsonl", { runId: this.runId, ...record });
    this._actionableCount++;
    if (record.netSpreadApy > this._bestApy) {
      this._bestApy = record.netSpreadApy;
      this._bestOpp = {
        symbol: record.symbol,
        short: record.shortExchange,
        long: record.longExchange,
        netApy: record.netSpreadApy,
      };
    }
  }

  /** Write summary.json and mark run complete */
  finalize(): Summary {
    if (this._completed) {
      const existing = JSON.parse(fs.readFileSync(path.join(this.dir, "summary.json"), "utf8"));
      return existing;
    }
    this._completed = true;
    const now = Date.now();

    const summary: Summary = {
      runId: this.runId,
      startedAt: this._startedAt,
      endedAt: now,
      wallClockDurationMs: now - this._startedAt,
      completedCycles: this.config.totalCycles,
      symbolsChecked: this.config.symbols.length,
      fundingSnapshotsExpected: this._totalFundingSnapshotsExpected,
      fundingSnapshotsWritten: this._totalFundingSnapshotsWritten,
      fundingReadsOk: this._totalFundingReadsOk,
      fundingReadsFailed: this._totalFundingReadsFailed,
      viableCandidatesObserved: this._viableCount,
      actionableOpportunitiesObserved: this._actionableCount,
      bestOpportunity: this._bestOpp,
      bestNetSpreadApy: this._bestApy,
      readinessStatus: this._actionableCount > 0 ? "signal_found" : "waiting_for_spread",
      degradedCycles: this._degradedCycles,
      errors: this._errorCount,
      realOrdersExecuted: 0,
      postRequests: 0,
      putRequests: 0,
      deleteRequests: 0,
    };

    writeJson(this.dir, "summary.json", summary);
    return summary;
  }

  get directory(): string {
    return this.dir;
  }
}

// ──────────── Helpers ────────────

let _runCounter = 0;

/** Generate a unique run ID */
export function generateRunId(): string {
  _runCounter++;
  const ts = Date.now();
  const date = new Date(ts).toISOString().replace(/[:-]/g, "").replace(/\.\d+Z/, "");
  return `run-${date}-${String(_runCounter).padStart(3, "0")}`;
}

/** Get the base data directory */
export function getBaseDir(): string {
  return BASE_DIR;
}
