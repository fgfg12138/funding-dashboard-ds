/**
 * Kill Switch Engine Tests — Live Phase 7
 *
 * Acceptance criteria:
 *   LiveRiskDecision: action=require_manual_review, level=critical,
 *     categories=[reconciliation], reasons=["High severity reconciliation issue"]
 *   Config: enabled=true, triggerOnCriticalRisk=true, triggerOnManualReview=true,
 *     manualUnlockRequired=true
 *   → allowed=false, state.status=locked, action=manual_review_required
 *   → reasons include: manual_review_required, critical_risk, reconciliation_failure
 */

import { describe, expect, it } from "vitest";
import {
  applyKillSwitchState,
  canExecuteAction,
  createInitialKillSwitchState,
  evaluateKillSwitch,
  lockKillSwitch,
  unlockKillSwitch,
} from "./killSwitchEngine";
import type { LiveRiskDecision } from "./riskEngineTypes";
import type { KillSwitchConfig, KillSwitchState, KillSwitchTriggerReason } from "./killSwitchTypes";

// ─── Helpers ─────────────────────────────────────────────

function makeRiskDecision(overrides?: Partial<LiveRiskDecision>): LiveRiskDecision {
  return {
    action: "require_manual_review",
    level: "critical",
    categories: ["reconciliation"],
    reasons: ["High severity reconciliation issue"],
    generatedAt: Date.now(),
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<KillSwitchConfig>): KillSwitchConfig {
  return {
    enabled: true,
    triggerOnCriticalRisk: true,
    triggerOnManualReview: true,
    triggerOnRepeatedFailures: true,
    triggerOnReconciliationFailure: true,
    triggerOnCapitalOveruse: true,
    triggerOnPortfolioDelta: true,
    allowReduceOnlyWhenTriggered: true,
    manualUnlockRequired: true,
    ...overrides,
  };
}

const INITIAL_STATE = createInitialKillSwitchState();

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  it("critical risk + manual review + recon → locked, manual_review_required", () => {
    const decision = evaluateKillSwitch(
      INITIAL_STATE,
      makeRiskDecision(),
      makeConfig(),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.state.status).toBe("locked");
    expect(decision.action).toBe("manual_review_required");
    expect(decision.state.reasons).toContain("manual_review_required");
    expect(decision.state.reasons).toContain("critical_risk");
    expect(decision.state.reasons).toContain("reconciliation_failure");
  });
});

// ─── enabled=false ───────────────────────────────────────

describe("enabled=false", () => {
  it("always allows regardless of risk", () => {
    const decision = evaluateKillSwitch(
      INITIAL_STATE,
      makeRiskDecision({ level: "critical" }),
      makeConfig({ enabled: false }),
    );

    expect(decision.allowed).toBe(true);
    expect(decision.action).toBe("allow");
    expect(decision.state.status).toBe("active");
  });
});

// ─── Low risk ────────────────────────────────────────────

describe("low risk", () => {
  it("allows when risk is low", () => {
    const decision = evaluateKillSwitch(
      INITIAL_STATE,
      makeRiskDecision({ action: "allow", level: "low", categories: [] }),
      makeConfig(),
    );

    expect(decision.allowed).toBe(true);
    expect(decision.action).toBe("allow");
    expect(decision.state.status).toBe("active");
  });
});

// ─── Trigger conditions ─────────────────────────────────

describe("trigger conditions", () => {
  it("critical risk triggers", () => {
    const d = evaluateKillSwitch(INITIAL_STATE, makeRiskDecision({ level: "critical", categories: [] }));
    expect(d.state.reasons).toContain("critical_risk");
  });

  it("manual review required triggers", () => {
    const d = evaluateKillSwitch(INITIAL_STATE, makeRiskDecision({ action: "require_manual_review" }));
    expect(d.state.reasons).toContain("manual_review_required");
  });

  it("reconciliation category triggers", () => {
    const d = evaluateKillSwitch(INITIAL_STATE, makeRiskDecision({ categories: ["reconciliation"] }));
    expect(d.state.reasons).toContain("reconciliation_failure");
  });

  it("capital category triggers", () => {
    const d = evaluateKillSwitch(INITIAL_STATE, makeRiskDecision({ categories: ["capital"] }));
    expect(d.state.reasons).toContain("capital_overuse");
  });

  it("portfolio category triggers", () => {
    const d = evaluateKillSwitch(INITIAL_STATE, makeRiskDecision({ categories: ["portfolio"] }));
    expect(d.state.reasons).toContain("portfolio_delta_exceeded");
  });

  it("execution category triggers", () => {
    const d = evaluateKillSwitch(INITIAL_STATE, makeRiskDecision({ categories: ["execution"] }));
    expect(d.state.reasons).toContain("repeated_execution_failures");
  });
});

// ─── canExecuteAction — triggered reduce_only ────────────

describe("canExecuteAction — triggered reduce_only", () => {
  const triggeredState: KillSwitchState = {
    status: "triggered",
    action: "reduce_only",
    reasons: ["critical_risk"],
    triggeredAt: Date.now(),
    updatedAt: Date.now(),
  };

  it("allows exit in reduce_only mode", () => {
    const d = canExecuteAction(triggeredState, "exit");
    expect(d.allowed).toBe(true);
  });

  it("blocks entry in reduce_only mode", () => {
    const d = canExecuteAction(triggeredState, "entry");
    expect(d.allowed).toBe(false);
  });

  it("allows reduce_only in reduce_only mode", () => {
    const d = canExecuteAction(triggeredState, "reduce_only");
    expect(d.allowed).toBe(true);
  });

  it("allows cancel_order in reduce_only mode", () => {
    const d = canExecuteAction(triggeredState, "cancel_order");
    expect(d.allowed).toBe(true);
  });

  it("allows read_only in reduce_only mode", () => {
    const d = canExecuteAction(triggeredState, "read_only");
    expect(d.allowed).toBe(true);
  });
});

// ─── canExecuteAction — locked ──────────────────────────

describe("canExecuteAction — locked", () => {
  const lockedState: KillSwitchState = {
    status: "locked",
    action: "manual_review_required",
    reasons: ["critical_risk"],
    triggeredAt: Date.now(),
    lockedAt: Date.now(),
    updatedAt: Date.now(),
  };

  it("allows read_only in locked state", () => {
    const d = canExecuteAction(lockedState, "read_only");
    expect(d.allowed).toBe(true);
  });

  it("blocks entry in locked state", () => {
    const d = canExecuteAction(lockedState, "entry");
    expect(d.allowed).toBe(false);
  });

  it("blocks exit in locked state", () => {
    const d = canExecuteAction(lockedState, "exit");
    expect(d.allowed).toBe(false);
  });
});

// ─── lockKillSwitch / unlockKillSwitch ─────────────────

describe("lockKillSwitch / unlockKillSwitch", () => {
  it("lockKillSwitch sets status to locked with operator_lock reason", () => {
    const state = createInitialKillSwitchState();
    const locked = lockKillSwitch(state);
    expect(locked.status).toBe("locked");
    expect(locked.reasons).toContain("operator_lock");
  });

  it("unlockKillSwitch resets to active", () => {
    const unlocked = unlockKillSwitch();
    expect(unlocked.status).toBe("active");
    expect(unlocked.action).toBe("allow");
  });
});

// ─── Manual unlock required ─────────────────────────

describe("manualUnlockRequired", () => {
  it("when true, triggered becomes locked", () => {
    const d = evaluateKillSwitch(
      INITIAL_STATE,
      makeRiskDecision({ level: "critical", categories: [] }),
      makeConfig({ manualUnlockRequired: true }),
    );
    expect(d.state.status).toBe("locked");
  });

  it("when false, triggered stays triggered", () => {
    const d = evaluateKillSwitch(
      INITIAL_STATE,
      makeRiskDecision({ level: "critical", categories: [] }),
      makeConfig({ manualUnlockRequired: false }),
    );
    expect(d.state.status).toBe("triggered");
  });
});

// ─── block_all mode ─────────────────────────────────

describe("block_all mode", () => {
  it("when allowReduceOnlyWhenTriggered=false, action is block_all", () => {
    const d = evaluateKillSwitch(
      INITIAL_STATE,
      makeRiskDecision({ level: "critical", categories: [] }),
      makeConfig({ manualUnlockRequired: false, allowReduceOnlyWhenTriggered: false }),
    );
    expect(d.action).toBe("block_all");
    expect(d.allowed).toBe(false);
  });
});

// ─── createInitialKillSwitchState ─────────────────

describe("createInitialKillSwitchState", () => {
  it("returns active state", () => {
    const state = createInitialKillSwitchState();
    expect(state.status).toBe("active");
    expect(state.action).toBe("allow");
    expect(state.reasons).toEqual([]);
  });
});

// ─── Immutability ────────────────────────────────

describe("immutability", () => {
  it("does not mutate input state", () => {
    const state = createInitialKillSwitchState();
    const originalStatus = state.status;
    lockKillSwitch(state);
    expect(state.status).toBe(originalStatus);
  });
});
