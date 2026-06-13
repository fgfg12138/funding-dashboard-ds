/**
 * Signal-Gated Mainnet Tiny Dry Run Framework
 *
 * Strict gate: only allows a dry run when the Spread Watcher produces
 * a fresh, valid, actionable signal. All other paths are blocked.
 *
 * ⛔ No connectors, no API calls, no order placement.
 */

// ──────────── Types ────────────

export type WatcherActionableSignal = {
  cycle: number;
  symbol: string;
  short: string;
  long: string;
  netApy: number;
};

export type WatcherReport = {
  readinessStatus: string;
  actionableOpportunitiesObserved: number;
  bestOpportunity?: WatcherActionableSignal;
  firstActionableOpportunity?: WatcherActionableSignal;
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
};

export type SignalGatedTinyDryRunInput = {
  watcherReport: WatcherReport;
  selectedSignal: WatcherActionableSignal | null;
  enabledExchanges: string[];
  pausedExchanges: string[];
  maxPositionUsd: number;
  maxCapitalUsd: number;
  requireSignalFreshnessMs: number;
  now: number;
};

export type DryRunStatus =
  | "blocked_waiting_for_spread"
  | "blocked_no_signal"
  | "blocked_stale_signal"
  | "blocked_forbidden_exchange"
  | "blocked_private_api"
  | "blocked_risk"
  | "ready_for_dry_run";

export type SignalGatedTinyDryRunDecision = {
  allowed: boolean;
  status: DryRunStatus;
  reason: string;
  selectedSymbol: string | null;
  shortExchange: string | null;
  longExchange: string | null;
  netSpreadApy: number;
  targetNotionalUsd: number | null;
  blockers: string[];
  generatedAt: number;
};

// ──────────── Constants ────────────

const ALLOWED_EXCHANGES = new Set(["binance", "okx", "htx"]);
const PAUSED_EXCHANGES = new Set(["bybit", "bitget", "gate", "hyperliquid"]);
const MIN_NET_SPREAD_APY = 3;

// ──────────── Gate functions ────────────

/**
 * Validates that the watcher has found at least one actionable signal.
 */
function validateWatcherSignal(report: WatcherReport): string | null {
  if (report.readinessStatus !== "signal_found") {
    return `readinessStatus is "${report.readinessStatus}", expected "signal_found"`;
  }
  if (report.actionableOpportunitiesObserved <= 0) {
    return `actionableOpportunitiesObserved is ${report.actionableOpportunitiesObserved}, expected > 0`;
  }
  return null;
}

/**
 * Validates that the selected signal is fresh enough.
 */
function validateSignalFreshness(
  signal: WatcherActionableSignal,
  requireFreshnessMs: number,
  now: number,
  generatedAt: number
): string | null {
  const signalAgeMs = now - generatedAt;
  if (signalAgeMs > requireFreshnessMs) {
    return `Signal age ${signalAgeMs}ms exceeds max freshness ${requireFreshnessMs}ms`;
  }
  return null;
}

/**
 * Validates the signal's exchange scope — only binance/okx/htx allowed,
 * paused exchanges forbidden.
 */
function validateSignalExchangeScope(signal: WatcherActionableSignal): string | null {
  if (!ALLOWED_EXCHANGES.has(signal.short) || !ALLOWED_EXCHANGES.has(signal.long)) {
    return `Exchange pair (${signal.short}/${signal.long}) includes non-allowed exchange`;
  }
  if (PAUSED_EXCHANGES.has(signal.short) || PAUSED_EXCHANGES.has(signal.long)) {
    return `Exchange pair (${signal.short}/${signal.long}) includes paused exchange`;
  }
  return null;
}

/**
 * Validates the watcher's private-API safety guarantees.
 */
function validatePrivateApiSafety(report: WatcherReport): string | null {
  if (report.privateApiCalled) return "Watcher called private API";
  if (report.mainnetOrderAttempted) return "Watcher attempted mainnet order";
  if (report.realOrdersExecuted > 0) return `Watcher executed ${report.realOrdersExecuted} real orders`;
  if (report.postRequests > 0) return `Watcher made ${report.postRequests} POST requests`;
  if (report.putRequests > 0) return `Watcher made ${report.putRequests} PUT requests`;
  if (report.deleteRequests > 0) return `Watcher made ${report.deleteRequests} DELETE requests`;
  return null;
}

/**
 * Validates the position size is within allowed cap.
 */
function validatePositionSize(
  maxPositionUsd: number,
  maxCapitalUsd: number
): string | null {
  if (!Number.isFinite(maxPositionUsd)) return "maxPositionUsd is not finite";
  if (!Number.isFinite(maxCapitalUsd)) return "maxCapitalUsd is not finite";
  if (maxPositionUsd <= 0) return `maxPositionUsd=${maxPositionUsd} must be > 0`;
  if (maxCapitalUsd <= 0) return `maxCapitalUsd=${maxCapitalUsd} must be > 0`;
  if (maxPositionUsd > maxCapitalUsd) {
    return `maxPositionUsd=${maxPositionUsd} exceeds maxCapitalUsd=${maxCapitalUsd}`;
  }
  return null;
}

/**
 * Main gate: evaluates whether a tiny dry run is allowed.
 * Pure function — no side effects, no API calls.
 */
export function evaluateSignalGatedTinyDryRun(
  input: SignalGatedTinyDryRunInput
): SignalGatedTinyDryRunDecision {
  const blockers: string[] = [];
  const ts = Date.now();

  // 1. Validate enabled / paused exchanges
  const enabledOk =
    input.enabledExchanges.length === 3 &&
    input.enabledExchanges[0] === "binance" &&
    input.enabledExchanges[1] === "okx" &&
    input.enabledExchanges[2] === "htx";
  if (!enabledOk) {
    blockers.push(`enabledExchanges must be [binance, okx, htx], got [${input.enabledExchanges}]`);
  }

  const pausedContainsAll = ["bybit", "bitget", "gate", "hyperliquid"].every((e) =>
    input.pausedExchanges.includes(e)
  );
  if (!pausedContainsAll) {
    blockers.push(`pausedExchanges must include bybit/bitget/gate/hyperliquid`);
  }

  // 2. Validate watcher signal state
  const watcherBlocker = validateWatcherSignal(input.watcherReport);
  if (watcherBlocker) {
    blockers.push(watcherBlocker);
  }

  // 3. Validate selected signal exists
  if (!input.selectedSignal) {
    blockers.push("No selected signal provided");
  }

  // 4. Validate signal properties (only if signal exists)
  if (input.selectedSignal) {
    const sig = input.selectedSignal;

    // Freshness
    const freshBlocker = validateSignalFreshness(
      sig,
      input.requireSignalFreshnessMs,
      input.now,
      input.watcherReport.generatedAt
    );
    if (freshBlocker) blockers.push(freshBlocker);

    // Exchange scope
    const scopeBlocker = validateSignalExchangeScope(sig);
    if (scopeBlocker) blockers.push(scopeBlocker);

    // APY threshold
    if (!Number.isFinite(sig.netApy) || sig.netApy < MIN_NET_SPREAD_APY) {
      blockers.push(`netSpreadApy=${sig.netApy} < ${MIN_NET_SPREAD_APY}%`);
    }
  }

  // 5. Private API safety
  const safetyBlocker = validatePrivateApiSafety(input.watcherReport);
  if (safetyBlocker) blockers.push(safetyBlocker);

  // 6. Position size
  const sizeBlocker = validatePositionSize(input.maxPositionUsd, input.maxCapitalUsd);
  if (sizeBlocker) blockers.push(sizeBlocker);

  // Determine status
  const allowed = blockers.length === 0;
  const status: DryRunStatus = allowed
    ? "ready_for_dry_run"
    : blockers.some((b) => b.includes("readinessStatus") || b.includes("actionableOpportunitiesObserved"))
      ? "blocked_waiting_for_spread"
      : blockers.some((b) => b.includes("No selected signal") || b.includes("netSpreadApy"))
        ? "blocked_no_signal"
        : blockers.some((b) => b.includes("exceeds max freshness"))
          ? "blocked_stale_signal"
          : blockers.some((b) => b.includes("Exchange pair") || b.includes("enabledExchanges") || b.includes("pausedExchanges"))
            ? "blocked_forbidden_exchange"
            : blockers.some((b) => b.includes("private API") || b.includes("mainnet order") || b.includes("real orders") || b.includes("POST") || b.includes("PUT") || b.includes("DELETE"))
              ? "blocked_private_api"
              : "blocked_risk";

  const reason = allowed
    ? "All gates passed — ready for tiny dry run"
    : `Blocked by ${blockers.length} gate(s): ${blockers[0]}${blockers.length > 1 ? ` (+${blockers.length - 1} more)` : ""}`;

  const selectedSymbol = input.selectedSignal?.symbol ?? null;

  return {
    allowed,
    status,
    reason,
    selectedSymbol,
    shortExchange: input.selectedSignal?.short ?? null,
    longExchange: input.selectedSignal?.long ?? null,
    netSpreadApy: input.selectedSignal?.netApy ?? 0,
    targetNotionalUsd: null, // Position sizing is separate
    blockers,
    generatedAt: ts,
  };
}

/**
 * Convenience: builds the decision from a watcher report and signal.
 * Defaults to $50 max position / $200 max capital / 5 min freshness.
 */
export function buildSignalGatedDryRunDecision(
  report: WatcherReport,
  signal: WatcherActionableSignal | null,
  overrides?: Partial<SignalGatedTinyDryRunInput>
): SignalGatedTinyDryRunDecision {
  return evaluateSignalGatedTinyDryRun({
    watcherReport: report,
    selectedSignal: signal,
    enabledExchanges: ["binance", "okx", "htx"],
    pausedExchanges: ["bybit", "bitget", "gate", "hyperliquid"],
    maxPositionUsd: overrides?.maxPositionUsd ?? 50,
    maxCapitalUsd: overrides?.maxCapitalUsd ?? 200,
    requireSignalFreshnessMs: overrides?.requireSignalFreshnessMs ?? 5 * 60 * 1000,
    now: overrides?.now ?? Date.now(),
  });
}
