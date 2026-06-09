/**
 * Stability Run Types — 7-Day Long-Term Stability Validation
 *
 * Extends the Shadow Run concept with stress scenarios (normal market,
 * funding decline, risk spike) and additional KPIs for long-term analysis.
 *
 * Pure types — no logic.
 */

// ─── Stress Scenario ────────────────────────────────────

export type StressScenario = "normal" | "funding_decline" | "risk_spike";

// ─── Config ──────────────────────────────────────────────

export type StabilityRunConfig = {
  /** Total capital for the simulation (default 100,000). */
  totalCapitalUsd?: number;

  /** Interval between cycles in minutes (default 5). */
  intervalMinutes?: number;

  /** Total duration in hours (default 168 = 7 days). */
  durationHours?: number;

  /** Whether to run in plan-only mode (default true). */
  dryRun?: boolean;

  /** Start time for the simulation (ms). Default Date.now(). */
  startTime?: number;

  /**
   * Stress scenario to apply.
   * "normal" — standard market conditions.
   * "funding_decline" — funding rates drop over time, triggering exits.
   * "risk_spike" — sudden risk spikes trigger Kill Switch.
   */
  scenario?: StressScenario;
};

// ─── Per-Cycle Result ───────────────────────────────────

export type StabilityCycleResult = {
  /** Cycle number (0-based). */
  cycle: number;
  /** Simulated timestamp (ms). */
  currentTime: number;
  /** Number of open positions. */
  openPositionCount: number;
  /** Number of closed positions. */
  closedPositionCount: number;
  /** Total funding collected so far. */
  totalFundingCollected: number;
  /** Portfolio delta percent. */
  deltaPercent: number;
  /** Capital utilisation percent. */
  capitalUtilizationPercent: number;
  /** Current overall risk level. */
  riskLevel: string;
  /** Risk engine action. */
  riskAction: string;
  /** Kill switch action. */
  killSwitchAction: string;
  /** Whether entry was attempted this cycle. */
  entryAttempted: boolean;
  /** Whether exit was attempted this cycle. */
  exitAttempted: boolean;
  /** Error message (empty on success). */
  error: string;
};

// ─── Report ──────────────────────────────────────────────

export type StabilityRunReport = {
  /** Configuration used. */
  config: Required<StabilityRunConfig>;
  /** Per-cycle results. */
  cycles: StabilityCycleResult[];
  /** Total cycles (should equal 2016 for 7 days). */
  totalCycles: number;
  /** Cycles that completed (should equal totalCycles). */
  completedCycles: number;
  /** Total entry signals generated. */
  entrySignals: number;
  /** Total exit signals generated. */
  exitSignals: number;
  /** Total funding accrual events. */
  fundingEvents: number;
  /** Total risk categories triggered. */
  riskEvents: number;
  /** Number of cycles where kill switch was NOT "allow". */
  killSwitchTriggers: number;
  /** Maximum open positions observed. */
  maxOpenPositions: number;
  /** Maximum portfolio delta percent observed. */
  maxDeltaPercent: number;
  /** Maximum capital utilisation percent observed. */
  maxCapitalUtilizationPercent: number;
  /** Number of cycles with errors. */
  errorCount: number;
  /** Error details. */
  errors: string[];
  /** Wall clock time spent (ms). */
  wallClockMs: number;
  /** Simulated hours. */
  simulatedHours: number;
  /** When the run started (ms). */
  startedAt: number;
  /** When the run ended (ms). */
  endedAt: number;
};
