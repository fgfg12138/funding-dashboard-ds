/**
 * Watcher Result Import + Signal-Gated Dry Run Integration
 *
 * Safe layer that:
 * 1. Imports a watcher report
 * 2. Extracts the best signal
 * 3. Passes it through the signal-gated evaluator
 * 4. Outputs a gate decision report
 *
 * ⛔ No connectors, no API calls, no order placement.
 */

import {
  evaluateSignalGatedTinyDryRun,
  type WatcherReport,
  type WatcherActionableSignal,
  type SignalGatedTinyDryRunInput,
  type SignalGatedTinyDryRunDecision,
} from "./signalGatedTinyDryRun";

// ──────────── Types ────────────

/**
 * The raw watcher report as produced by any of the Spread Watcher tests.
 * Extra fields (mode, startedAt, etc.) are passed through to the output.
 */
export type RawWatcherReport = {
  /** Core watcher fields consumed by the gate evaluator */
  readinessStatus: string;
  actionableOpportunitiesObserved: number;
  bestOpportunity?: WatcherActionableSignal | null;
  firstActionableOpportunity?: WatcherActionableSignal | null;
  bestNetSpreadApy: number;
  symbolsWithoutSpread: string[];
  symbolsBlockedByQuantity: string[];
  symbolsBlockedByLiquidity: string[];
  privateApiCalled: boolean;
  mainnetOrderAttempted: boolean;
  realOrdersExecuted: number;
  postRequests: number;
  putRequests: number;
  deleteRequests: number;
  generatedAt: number;

  /** Watcher metadata (passed through to output) */
  mode?: string;
  startedAt?: number;
  endedAt?: number;
  wallClockDurationMs?: number;
  cycles?: number;
  completedCycles?: number;

  /** Any other fields are allowed and passed through */
  [key: string]: unknown;
};

export type WatcherGateDecisionReport = {
  /** Watcher metadata */
  watcherMode: string;
  watcherStartedAt: number | null;
  watcherEndedAt: number | null;
  watcherReadinessStatus: string;
  actionableOpportunitiesObserved: number;

  /** Selected signal details */
  selectedSignal: WatcherActionableSignal | null;
  signalAgeMs: number | null;

  /** Gate decision */
  gateDecisionStatus: string;
  allowed: boolean;
  reason: string;
  blockers: string[];

  /** Exchange scope */
  enabledExchanges: string[];
  pausedExchanges: string[];

  /** Safety flags */
  privateApiCalled: boolean;
  mainnetOrderAttempted: boolean;
  realOrdersExecuted: number;
  postRequests: number;
  putRequests: number;
  deleteRequests: number;

  /** Timestamp */
  generatedAt: number;
};

// ──────────── Defaults ────────────

const DEFAULT_ENABLED = ["binance", "okx", "htx"];
const DEFAULT_PAUSED = ["bybit", "bitget", "gate", "hyperliquid"];
const DEFAULT_FRESHNESS_MS = 5 * 60 * 1000;
const DEFAULT_MAX_POSITION = 50;
const DEFAULT_MAX_CAPITAL = 200;

// ──────────── Core functions ────────────

/**
 * Normalizes a raw watcher report into the WatcherReport type consumed
 * by the signal-gated evaluator.  Extra fields are silently passed through.
 */
export function importWatcherReport(raw: RawWatcherReport): WatcherReport {
  return {
    readinessStatus: String(raw.readinessStatus ?? "unknown"),
    actionableOpportunitiesObserved: Number(raw.actionableOpportunitiesObserved ?? 0),
    bestOpportunity: raw.bestOpportunity ?? undefined,
    firstActionableOpportunity: raw.firstActionableOpportunity ?? undefined,
    bestNetSpreadApy: Number(raw.bestNetSpreadApy ?? 0),
    symbolsWithoutSpread: Array.isArray(raw.symbolsWithoutSpread) ? [...raw.symbolsWithoutSpread] : [],
    symbolsBlockedByQuantity: Array.isArray(raw.symbolsBlockedByQuantity) ? [...raw.symbolsBlockedByQuantity] : [],
    symbolsBlockedByLiquidity: Array.isArray(raw.symbolsBlockedByLiquidity) ? [...raw.symbolsBlockedByLiquidity] : [],
    privateApiCalled: Boolean(raw.privateApiCalled),
    mainnetOrderAttempted: Boolean(raw.mainnetOrderAttempted),
    realOrdersExecuted: Number(raw.realOrdersExecuted ?? 0),
    postRequests: Number(raw.postRequests ?? 0),
    putRequests: Number(raw.putRequests ?? 0),
    deleteRequests: Number(raw.deleteRequests ?? 0),
    generatedAt: Number(raw.generatedAt ?? 0),
  };
}

/**
 * Extracts the best actionable signal from a normalized watcher report.
 * Priority: bestOpportunity > firstActionableOpportunity > null.
 */
export function extractSelectedSignal(
  report: WatcherReport
): WatcherActionableSignal | null {
  if (report.bestOpportunity) return { ...report.bestOpportunity };
  if (report.firstActionableOpportunity) return { ...report.firstActionableOpportunity };
  return null;
}

/**
 * Evaluates a raw watcher report for dry-run readiness.
 * This is the main entry point: import → extract → evaluate → report.
 *
 * @param raw — Raw watcher report (as emitted by any Spread Watcher)
 * @param now — Current timestamp (defaults to Date.now())
 * @param requireSignalFreshnessMs — Max signal age in ms (default 5 min)
 * @param maxPositionUsd — Max position size (default $50)
 * @param maxCapitalUsd — Max total capital (default $200)
 * @param enabledExchanges — Allowed exchange IDs (default [binance, okx, htx])
 * @param pausedExchanges — Blocked exchange IDs (default paused set)
 */
export function evaluateWatcherReportForDryRun(
  raw: RawWatcherReport,
  overrides?: {
    now?: number;
    requireSignalFreshnessMs?: number;
    maxPositionUsd?: number;
    maxCapitalUsd?: number;
    enabledExchanges?: string[];
    pausedExchanges?: string[];
  }
): WatcherGateDecisionReport {
  // 1. Normalize report
  const report = importWatcherReport(raw);

  // 2. Extract best signal
  const signal = extractSelectedSignal(report);

  // 3. Run the gate evaluator
  const input: SignalGatedTinyDryRunInput = {
    watcherReport: report,
    selectedSignal: signal,
    enabledExchanges: overrides?.enabledExchanges ?? DEFAULT_ENABLED,
    pausedExchanges: overrides?.pausedExchanges ?? DEFAULT_PAUSED,
    maxPositionUsd: overrides?.maxPositionUsd ?? DEFAULT_MAX_POSITION,
    maxCapitalUsd: overrides?.maxCapitalUsd ?? DEFAULT_MAX_CAPITAL,
    requireSignalFreshnessMs: overrides?.requireSignalFreshnessMs ?? DEFAULT_FRESHNESS_MS,
    now: overrides?.now ?? Date.now(),
  };

  const decision = evaluateSignalGatedTinyDryRun(input);

  // 4. Merge into gate decision report
  return generateWatcherGateDecisionReport(raw, report, signal, decision);
}

/**
 * Builds the final gate decision report from all intermediate results.
 */
export function generateWatcherGateDecisionReport(
  raw: RawWatcherReport,
  report: WatcherReport,
  signal: WatcherActionableSignal | null,
  decision: SignalGatedTinyDryRunDecision
): WatcherGateDecisionReport {
  const now = Date.now();
  const signalAgeMs = signal != null ? now - report.generatedAt : null;

  return {
    watcherMode: raw.mode ?? "unknown",
    watcherStartedAt: raw.startedAt ?? null,
    watcherEndedAt: raw.endedAt ?? null,
    watcherReadinessStatus: report.readinessStatus,
    actionableOpportunitiesObserved: report.actionableOpportunitiesObserved,

    selectedSignal: signal,
    signalAgeMs,

    gateDecisionStatus: decision.status,
    allowed: decision.allowed,
    reason: decision.reason,
    blockers: [...decision.blockers],

    enabledExchanges: [...DEFAULT_ENABLED],
    pausedExchanges: [...DEFAULT_PAUSED],

    privateApiCalled: report.privateApiCalled,
    mainnetOrderAttempted: report.mainnetOrderAttempted,
    realOrdersExecuted: report.realOrdersExecuted,
    postRequests: report.postRequests,
    putRequests: report.putRequests,
    deleteRequests: report.deleteRequests,

    generatedAt: now,
  };
}
