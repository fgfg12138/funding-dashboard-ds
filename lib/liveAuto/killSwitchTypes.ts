/**
 * Kill Switch Types — Live Phase 7
 *
 * Defines the global circuit breaker that consumes Live-6 Risk Engine
 * decisions and produces system-level allow/block decisions.
 *
 * Pure types — no logic.
 */

import type { LiveRiskDecision } from "./riskEngineTypes";

// ─── Status ──────────────────────────────────────────────

export type KillSwitchStatus = "active" | "triggered" | "locked";

// ─── Action ──────────────────────────────────────────────

export type KillSwitchAction = "allow" | "block_all" | "block_entry" | "reduce_only" | "manual_review_required";

// ─── Trigger reason ─────────────────────────────────────

export type KillSwitchTriggerReason =
  | "critical_risk"
  | "manual_review_required"
  | "repeated_execution_failures"
  | "reconciliation_failure"
  | "capital_overuse"
  | "portfolio_delta_exceeded"
  | "operator_lock";

// ─── Requested action (for canExecuteAction) ────────────

export type KillSwitchRequestedAction = "entry" | "exit" | "reduce_only" | "cancel_order" | "read_only";

// ─── State ───────────────────────────────────────────────

export type KillSwitchState = {
  /** Current kill switch status. */
  status: KillSwitchStatus;
  /** Current effective action. */
  action: KillSwitchAction;
  /** All trigger reasons (empty when active). */
  reasons: KillSwitchTriggerReason[];
  /** Timestamp (ms) when the kill switch was triggered. */
  triggeredAt?: number;
  /** Timestamp (ms) when the kill switch was locked. */
  lockedAt?: number;
  /** Timestamp (ms) when the state was last updated. */
  updatedAt: number;
};

// ─── Decision ────────────────────────────────────────────

export type KillSwitchDecision = {
  /** Whether the requested operation is allowed. */
  allowed: boolean;
  /** Current kill switch action. */
  action: KillSwitchAction;
  /** Human-readable reasons. */
  reasons: string[];
  /** Snapshotted kill switch state. */
  state: KillSwitchState;
  /** Timestamp (ms) when the decision was made. */
  generatedAt: number;
};

// ─── Config ──────────────────────────────────────────────

export type KillSwitchConfig = {
  /** Master on/off switch (default true). */
  enabled?: boolean;
  /** Trigger on critical risk (default true). */
  triggerOnCriticalRisk?: boolean;
  /** Trigger on manual review required (default true). */
  triggerOnManualReview?: boolean;
  /** Trigger on repeated execution failures (default true). */
  triggerOnRepeatedFailures?: boolean;
  /** Trigger on reconciliation failure (default true). */
  triggerOnReconciliationFailure?: boolean;
  /** Trigger on capital overuse (default true). */
  triggerOnCapitalOveruse?: boolean;
  /** Trigger on portfolio delta exceeded (default true). */
  triggerOnPortfolioDelta?: boolean;
  /** Allow reduce-only operations when triggered (default true). */
  allowReduceOnlyWhenTriggered?: boolean;
  /** Require manual unlock after triggered (default true). */
  manualUnlockRequired?: boolean;
};
