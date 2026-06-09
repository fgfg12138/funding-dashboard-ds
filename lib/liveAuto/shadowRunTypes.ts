/**
 * Shadow Run Types — 24h Stability Validation
 *
 * Defines data structures for the continuous simulation loop
 * that validates all Live modules under sustained operation.
 *
 * Pure types — no logic.
 */

import type { ArbitragePosition } from "../arbitrage/arbitragePositionTypes";
import type { FundingAccrualEvent } from "../arbitrage/fundingAccrualTypes";
import type { RiskEvent } from "../riskMonitoring/riskMonitoringTypes";
import type { LiveRiskDecision } from "./riskEngineTypes";
import type { KillSwitchDecision } from "./killSwitchTypes";
import type { PortfolioReport } from "../arbitrage/portfolioTypes";
import type { CapitalState } from "./capitalManagerTypes";

// ─── Config ──────────────────────────────────────────────

export type ShadowRunConfig = {
  /** Total capital for the simulation (default 100,000). */
  totalCapitalUsd?: number;

  /** Interval between cycles in minutes (default 5). */
  intervalMinutes?: number;

  /** Total duration in hours (default 24). */
  durationHours?: number;

  /** Whether to enable all safety checks (default true). */
  enableSafetyChecks?: boolean;

  /** Whether to run entry/exit in plan-only mode (default true). */
  dryRun?: boolean;

  /**
   * Start time for the simulation (ms).
   * Defaults to Date.now() when not provided.
   */
  startTime?: number;
};

// ─── Per-cycle snapshot ─────────────────────────────────

export type ShadowRunCycleResult = {
  /** Cycle number (0-based). */
  cycle: number;
  /** Simulated timestamp (ms) for this cycle. */
  currentTime: number;
  /** Number of open positions during this cycle. */
  openPositionCount: number;
  /** Number of positions closed during this cycle. */
  closedPositionCount: number;
  /** Total funding collected so far. */
  totalFundingCollected: number;
  /** Risk level from Beta-5 Risk Monitoring. */
  riskLevel: string;
  /** Live-6 risk decision action. */
  riskAction: string;
  /** Live-7 kill switch decision action. */
  killSwitchAction: string;
  /** Whether an entry was attempted (planned) this cycle. */
  entryAttempted: boolean;
  /** Whether an exit was attempted (planned) this cycle. */
  exitAttempted: boolean;
  /** Error message if this cycle failed (empty on success). */
  error: string;
};

// ─── Report ──────────────────────────────────────────────

export type ShadowRunReport = {
  /** Configuration used for this run. */
  config: Required<ShadowRunConfig>;
  /** Per-cycle results. */
  cycles: ShadowRunCycleResult[];
  /** Total simulated rounds completed. */
  totalCycles: number;
  /** Total simulated duration in hours. */
  simulatedHours: number;
  /** How many entry signals were generated. */
  entrySignalCount: number;
  /** How many exit signals were generated. */
  exitSignalCount: number;
  /** Total funding accrual events simulated. */
  fundingEventCount: number;
  /** Total risk events triggered across all cycles. */
  riskEventCount: number;
  /** Number of cycles where kill switch was triggered. */
  killSwitchTriggerCount: number;
  /** Maximum number of open positions observed. */
  maxOpenPositions: number;
  /** Total simulated positions closed. */
  closedPositionCount: number;
  /** Count of cycles that ended with errors. */
  errorCount: number;
  /** Total time the simulation took to run (ms). */
  wallClockMs: number;
};
