/**
 * Kill Switch Engine — Live Phase 7
 *
 * Global circuit breaker that consumes Live-6 Risk Engine decisions
 * and produces system-level allow/block decisions.
 *
 * Pure functions — no side effects, no order execution.
 */

import type { LiveRiskDecision } from "./riskEngineTypes";
import type {
  KillSwitchAction,
  KillSwitchConfig,
  KillSwitchDecision,
  KillSwitchRequestedAction,
  KillSwitchState,
  KillSwitchStatus,
  KillSwitchTriggerReason,
} from "./killSwitchTypes";

// ─── Defaults ────────────────────────────────────────────

const DEFAULTS = {
  enabled: true,
  triggerOnCriticalRisk: true,
  triggerOnManualReview: true,
  triggerOnRepeatedFailures: true,
  triggerOnReconciliationFailure: true,
  triggerOnCapitalOveruse: true,
  triggerOnPortfolioDelta: true,
  allowReduceOnlyWhenTriggered: true,
  manualUnlockRequired: true,
};

function resolveConfig(c?: KillSwitchConfig): Required<KillSwitchConfig> {
  return {
    enabled: c?.enabled ?? DEFAULTS.enabled,
    triggerOnCriticalRisk: c?.triggerOnCriticalRisk ?? DEFAULTS.triggerOnCriticalRisk,
    triggerOnManualReview: c?.triggerOnManualReview ?? DEFAULTS.triggerOnManualReview,
    triggerOnRepeatedFailures: c?.triggerOnRepeatedFailures ?? DEFAULTS.triggerOnRepeatedFailures,
    triggerOnReconciliationFailure: c?.triggerOnReconciliationFailure ?? DEFAULTS.triggerOnReconciliationFailure,
    triggerOnCapitalOveruse: c?.triggerOnCapitalOveruse ?? DEFAULTS.triggerOnCapitalOveruse,
    triggerOnPortfolioDelta: c?.triggerOnPortfolioDelta ?? DEFAULTS.triggerOnPortfolioDelta,
    allowReduceOnlyWhenTriggered: c?.allowReduceOnlyWhenTriggered ?? DEFAULTS.allowReduceOnlyWhenTriggered,
    manualUnlockRequired: c?.manualUnlockRequired ?? DEFAULTS.manualUnlockRequired,
  };
}

// ─── Public API ──────────────────────────────────────────

/**
 * Create the initial (active) kill switch state.
 */
export function createInitialKillSwitchState(): KillSwitchState {
  return {
    status: "active",
    action: "allow",
    reasons: [],
    updatedAt: Date.now(),
  };
}

/**
 * Evaluate the kill switch from a Live-6 risk decision.
 *
 * Checks all trigger conditions and returns the new state + decision.
 *
 * @param currentState - Current kill switch state.
 * @param riskDecision - Live-6 risk engine decision.
 * @param config       - Kill switch configuration.
 * @returns A KillSwitchDecision with the effective action and whether it's allowed.
 */
export function evaluateKillSwitch(
  currentState: KillSwitchState,
  riskDecision: LiveRiskDecision,
  config?: KillSwitchConfig,
): KillSwitchDecision {
  const cfg = resolveConfig(config);

  // If disabled, always allow
  if (!cfg.enabled) {
    const state: KillSwitchState = {
      status: "active",
      action: "allow",
      reasons: [],
      updatedAt: Date.now(),
    };
    return {
      allowed: true,
      action: "allow",
      reasons: ["Kill switch is disabled."],
      state,
      generatedAt: Date.now(),
    };
  }

  // If already locked, maintain locked state
  if (currentState.status === "locked") {
    const action: KillSwitchAction = "manual_review_required";
    return {
      allowed: false,
      action,
      reasons: ["System is locked — manual unlock required.", ...currentState.reasons.map((r) => `Trigger: ${r}`)],
      state: { ...currentState, updatedAt: Date.now() },
      generatedAt: Date.now(),
    };
  }

  // Collect trigger reasons
  const triggerReasons: KillSwitchTriggerReason[] = [];

  // 1. Manual review required
  if (cfg.triggerOnManualReview && riskDecision.action === "require_manual_review") {
    triggerReasons.push("manual_review_required");
  }

  // 2. Critical risk
  if (cfg.triggerOnCriticalRisk && riskDecision.level === "critical") {
    triggerReasons.push("critical_risk");
  }

  // 3. Reconciliation failure
  if (cfg.triggerOnReconciliationFailure && riskDecision.categories.includes("reconciliation")) {
    triggerReasons.push("reconciliation_failure");
  }

  // 4. Capital overuse
  if (cfg.triggerOnCapitalOveruse && riskDecision.categories.includes("capital")) {
    triggerReasons.push("capital_overuse");
  }

  // 5. Portfolio delta
  if (cfg.triggerOnPortfolioDelta && riskDecision.categories.includes("portfolio")) {
    triggerReasons.push("portfolio_delta_exceeded");
  }

  // 6. Execution failures
  if (cfg.triggerOnRepeatedFailures && riskDecision.categories.includes("execution")) {
    triggerReasons.push("repeated_execution_failures");
  }

  // Build state and decision
  if (triggerReasons.length > 0) {
    return applyKillSwitchState(currentState, triggerReasons, cfg);
  }

  // No trigger — active
  const state: KillSwitchState = {
    status: "active",
    action: "allow",
    reasons: [],
    updatedAt: Date.now(),
  };

  return {
    allowed: true,
    action: "allow",
    reasons: ["All risk checks passed — system is healthy."],
    state,
    generatedAt: Date.now(),
  };
}

/**
 * Apply trigger reasons to create a new kill switch state.
 */
export function applyKillSwitchState(
  currentState: KillSwitchState,
  triggerReasons: KillSwitchTriggerReason[],
  config?: KillSwitchConfig,
): KillSwitchDecision {
  const cfg = resolveConfig(config);
  const now = Date.now();

  // Determine status
  let status: KillSwitchStatus;
  let action: KillSwitchAction;

  if (cfg.manualUnlockRequired) {
    status = "locked";
    action = "manual_review_required";
  } else {
    status = "triggered";
    if (cfg.allowReduceOnlyWhenTriggered) {
      action = "reduce_only";
    } else {
      action = "block_all";
    }
  }

  const state: KillSwitchState = {
    status,
    action,
    reasons: triggerReasons,
    triggeredAt: currentState.triggeredAt ?? now,
    lockedAt: status === "locked" ? (currentState.lockedAt ?? now) : undefined,
    updatedAt: now,
  };

  const allowed = action === "reduce_only";
  const reasons = buildDecisionReasons(triggerReasons, status, action);

  return {
    allowed,
    action,
    reasons,
    state,
    generatedAt: now,
  };
}

function buildDecisionReasons(
  triggerReasons: KillSwitchTriggerReason[],
  status: KillSwitchStatus,
  action: KillSwitchAction,
): string[] {
  const reasons: string[] = [];

  for (const reason of triggerReasons) {
    switch (reason) {
      case "critical_risk":
        reasons.push("Critical portfolio risk detected — system triggered");
        break;
      case "manual_review_required":
        reasons.push("Manual review required — system locked");
        break;
      case "repeated_execution_failures":
        reasons.push("Repeated execution failures detected");
        break;
      case "reconciliation_failure":
        reasons.push("Position reconciliation failure detected");
        break;
      case "capital_overuse":
        reasons.push("Capital utilisation exceeded safe threshold");
        break;
      case "portfolio_delta_exceeded":
        reasons.push("Portfolio delta exceeded maximum");
        break;
      case "operator_lock":
        reasons.push("Operator manually locked the system");
        break;
    }
  }

  if (status === "locked") {
    reasons.push("Manual unlock required to resume operations");
  }
  if (action === "reduce_only") {
    reasons.push("System in reduce-only mode — new entries blocked");
  }
  if (action === "block_all") {
    reasons.push("All operations blocked");
  }

  return reasons;
}

/**
 * Check whether a specific action is permitted given the current kill switch state.
 *
 * @param state           - Current kill switch state.
 * @param requestedAction - The action being requested.
 * @returns A KillSwitchDecision indicating whether the action is allowed.
 */
export function canExecuteAction(
  state: KillSwitchState,
  requestedAction: KillSwitchRequestedAction,
): KillSwitchDecision {
  const now = Date.now();

  // Active — everything allowed
  if (state.status === "active") {
    return {
      allowed: true,
      action: "allow",
      reasons: ["System is active."],
      state,
      generatedAt: now,
    };
  }

  // Locked — only read-only
  if (state.status === "locked") {
    if (requestedAction === "read_only") {
      return {
        allowed: true,
        action: "allow",
        reasons: ["Read-only operations are permitted in locked state."],
        state,
        generatedAt: now,
      };
    }
    return {
      allowed: false,
      action: "manual_review_required",
      reasons: ["System is locked — only read-only operations allowed.", `Requested "${requestedAction}" is blocked.`],
      state,
      generatedAt: now,
    };
  }

  // Triggered — check based on action
  if (state.action === "reduce_only") {
    const allowedActions: KillSwitchRequestedAction[] = ["exit", "reduce_only", "cancel_order", "read_only"];
    if (allowedActions.includes(requestedAction)) {
      return {
        allowed: true,
        action: state.action,
        reasons: [`"${requestedAction}" is permitted in reduce-only mode.`],
        state,
        generatedAt: now,
      };
    }
    return {
      allowed: false,
      action: state.action,
      reasons: [`"${requestedAction}" is blocked in reduce-only mode.`, "Only exit, reduce_only, cancel_order, and read_only are allowed."],
      state,
      generatedAt: now,
    };
  }

  // block_all
  if (requestedAction === "read_only") {
    return {
      allowed: true,
      action: state.action,
      reasons: ["Read-only operations are always permitted."],
      state,
      generatedAt: now,
    };
  }

  return {
    allowed: false,
    action: state.action,
    reasons: [`All operations blocked. Requested "${requestedAction}" is not allowed.`],
    state,
    generatedAt: now,
  };
}

/**
 * Manually lock the kill switch (operator action).
 */
export function lockKillSwitch(state: KillSwitchState): KillSwitchState {
  const now = Date.now();
  return {
    status: "locked",
    action: "manual_review_required",
    reasons: [...new Set([...state.reasons, "operator_lock" as KillSwitchTriggerReason])],
    triggeredAt: state.triggeredAt ?? now,
    lockedAt: state.lockedAt ?? now,
    updatedAt: now,
  };
}

/**
 * Manually unlock the kill switch.
 * Only works if manualUnlockRequired was set.
 * Resets to active state.
 */
export function unlockKillSwitch(): KillSwitchState {
  return createInitialKillSwitchState();
}
