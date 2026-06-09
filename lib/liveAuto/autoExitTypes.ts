/**
 * Auto Exit Types — Live Phase 4
 *
 * Defines data structures for the automated exit pipeline that
 * monitors positions, detects exit conditions, builds close hedge plans,
 * and executes exit through the Hedge Engine.
 *
 * Pure types — no logic.
 */

import type { HedgePlan, HedgeExecutionResult } from "../hedgeEngine/hedgeEngineTypes";
import type { PositionExitSuggestion } from "../semiAuto/exitSuggestionTypes";

// ─── Config ──────────────────────────────────────────────

export type LiveAutoExitConfig = {
  /** Master on/off switch (default false). */
  enabled?: boolean;

  /** If true, plan only — never execute (default true). */
  dryRun?: boolean;

  /** Maximum holding hours before auto exit (default 48). */
  maxHoldingHours?: number;

  /** Minimum acceptable net APY percent (default 10). */
  minNetApyPercent?: number;

  /** Maximum absolute delta percent (default 3). */
  maxDeltaPercent?: number;

  /** Take-profit threshold in USD (default 500). */
  takeProfitUsd?: number;

  /** Stop-loss threshold in USD (default 500). */
  stopLossUsd?: number;

  /** Whether urgent exits (stop-loss, critical risk) are allowed (default true). */
  allowUrgentExit?: boolean;

  /** Allowed exchanges for exit. */
  allowedExchanges?: string[];

  /** Maximum total close notional in USD (default 100,000). */
  maxExitNotionalUsd?: number;

  /** Whether to require risk check before exit (default true). */
  requireRiskCheck?: boolean;
};

// ─── Exit Candidate ─────────────────────────────────────

export type AutoExitCandidate = {
  /** Position identifier. */
  positionId: string;
  /** Trading pair symbol. */
  symbol: string;
  /** Suggested exit status from Semi-4. */
  suggestionStatus: string;
  /** Total PnL at evaluation time. */
  totalPnlUsd: number;
  /** Cumulative funding collected. */
  fundingCollectedUsd: number;
  /** Delta as a percentage. */
  deltaPercent: number;
  /** Current net APY (optional). */
  currentNetApy?: number;
  /** Portfolio risk level (optional). */
  riskLevel?: string;
  /** Human-readable reason. */
  reason?: string;
};

// ─── Result ─────────────────────────────────────────────

export type AutoExitResultStatus = "blocked" | "planned" | "executed" | "partial" | "failed";

export type AutoExitResult = {
  /** Whether the operation succeeded overall. */
  success: boolean;
  /** Final status. */
  status: AutoExitResultStatus;
  /** The candidate that was evaluated. */
  candidate?: AutoExitCandidate;
  /** The exit suggestion from Semi-4 (if generated). */
  exitSuggestion?: PositionExitSuggestion;
  /** The hedge plan built for closing (if any). */
  hedgePlan?: HedgePlan;
  /** Result from Hedge Engine execution (if executed). */
  hedgeExecutionResult?: HedgeExecutionResult;
  /** Error messages (empty on success). */
  errors: string[];
  /** Timestamp (ms) when execution completed. */
  executedAt?: number;
};

// ─── Report ─────────────────────────────────────────────

export type AutoExitReport = {
  /** Results for each evaluated position. */
  results: AutoExitResult[];
  /** Count of planned (dry-run) exits. */
  plannedCount: number;
  /** Count of successfully executed exits. */
  executedCount: number;
  /** Count of blocked exits. */
  blockedCount: number;
  /** Count of failed exits. */
  failedCount: number;
  /** Timestamp (ms) when the report was generated. */
  generatedAt: number;
};
