/**
 * Tiny Trade Guard Engine Tests
 *
 * Covers:
 *   - Normal path (all checks pass)
 *   - Capital limit exceeded
 *   - Position limit exceeded
 *   - Critical risk
 *   - Kill switch locked
 *   - Insufficient balance
 *   - No API trade permission
 *   - Reconciliation failure
 *   - No manual confirmation
 *   - allowRealExecution=false
 *   - Account sync failure
 */

import { describe, expect, it } from "vitest";
import { evaluateTinyTradeGuard } from "./tinyTradeGuardEngine";
import { DEFAULT_TINY_TRADE_GUARD_CONFIG } from "./tinyTradeGuardTypes";
import type { TinyTradeGuardConfig, TinyTradeGuardContext } from "./tinyTradeGuardTypes";

// ─── Helpers ─────────────────────────────────────────────

function makePassingContext(overrides?: Partial<TinyTradeGuardContext>): TinyTradeGuardContext {
  return {
    currentCapitalUsd: 50,
    currentOpenPositions: 0,
    availableBalanceUsd: 100,
    riskDecision: { action: "allow", level: "low", categories: [], reasons: [], generatedAt: 0 },
    killSwitchDecision: { allowed: true, action: "allow", reasons: [], state: { status: "active", action: "allow", reasons: [], updatedAt: 0 }, generatedAt: 0 },
    accountSyncSuccess: true,
    reconciliationHasMismatches: false,
    apiHasTradePermission: true,
    hasManualConfirmation: true,
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<TinyTradeGuardConfig>): TinyTradeGuardConfig {
  return { ...DEFAULT_TINY_TRADE_GUARD_CONFIG, ...overrides };
}

// ─── Tests ───────────────────────────────────────────────

describe("TinyTradeGuard — Normal Path", () => {
  it("passes when all conditions are met", () => {
    const config = makeConfig({ allowRealExecution: true });
    const context = makePassingContext();
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(true);
    expect(decision.reasons).toHaveLength(0);
    expect(decision.capitalLimit).toBe(true);
    expect(decision.positionLimit).toBe(true);
    expect(decision.riskPassed).toBe(true);
    expect(decision.killSwitchPassed).toBe(true);
    expect(decision.balancePassed).toBe(true);
    expect(decision.permissionPassed).toBe(true);
    expect(decision.reconciliationPassed).toBe(true);
    expect(decision.confirmationPassed).toBe(true);
    expect(decision.accountSyncPassed).toBe(true);
  });
});

describe("TinyTradeGuard — Capital Limit", () => {
  it("blocks when capital exceeds 100", () => {
    const config = makeConfig({ allowRealExecution: true, maxCapitalUsd: 100 });
    const context = makePassingContext({ currentCapitalUsd: 150 });
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(false);
    expect(decision.capitalLimit).toBe(false);
    expect(decision.reasons.some((r) => r.includes("Capital"))).toBe(true);
  });

  it("passes when capital is exactly at limit", () => {
    const config = makeConfig({ allowRealExecution: true, maxCapitalUsd: 100 });
    const context = makePassingContext({ currentCapitalUsd: 100 });
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(true);
    expect(decision.capitalLimit).toBe(true);
  });

  it("passes when capital is well under limit", () => {
    const config = makeConfig({ allowRealExecution: true, maxCapitalUsd: 100 });
    const context = makePassingContext({ currentCapitalUsd: 25 });
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(true);
    expect(decision.capitalLimit).toBe(true);
  });
});

describe("TinyTradeGuard — Position Limit", () => {
  it("blocks when more than 1 open position", () => {
    const config = makeConfig({ allowRealExecution: true, maxOpenPositions: 1 });
    const context = makePassingContext({ currentOpenPositions: 2 });
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(false);
    expect(decision.positionLimit).toBe(false);
    expect(decision.reasons.some((r) => r.includes("positions"))).toBe(true);
  });

  it("passes with exactly 1 position", () => {
    const config = makeConfig({ allowRealExecution: true, maxOpenPositions: 1 });
    const context = makePassingContext({ currentOpenPositions: 1 });
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(true);
    expect(decision.positionLimit).toBe(true);
  });
});

describe("TinyTradeGuard — Risk Engine", () => {
  it("blocks critical risk level", () => {
    const config = makeConfig({ allowRealExecution: true });
    const context = makePassingContext({
      riskDecision: { action: "block_entry", level: "critical", categories: [], reasons: ["test"], generatedAt: 0 },
    });
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(false);
    expect(decision.riskPassed).toBe(false);
  });

  it("blocks on block_entry action", () => {
    const config = makeConfig({ allowRealExecution: true });
    const context = makePassingContext({
      riskDecision: { action: "block_entry", level: "high", categories: [], reasons: ["test"], generatedAt: 0 },
    });
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(false);
    expect(decision.riskPassed).toBe(false);
  });

  it("allows medium risk with allow action", () => {
    const config = makeConfig({ allowRealExecution: true });
    const context = makePassingContext({
      riskDecision: { action: "allow", level: "medium", categories: [], reasons: [], generatedAt: 0 },
    });
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(true);
    expect(decision.riskPassed).toBe(true);
  });
});

describe("TinyTradeGuard — Kill Switch", () => {
  it("blocks when kill switch is locked", () => {
    const config = makeConfig({ allowRealExecution: true });
    const context = makePassingContext({
      killSwitchDecision: {
        allowed: false,
        action: "block_all",
        reasons: ["System locked"],
        state: { status: "locked", action: "block_all", reasons: ["operator_lock"], lockedAt: 0, updatedAt: 0 },
        generatedAt: 0,
      },
    });
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(false);
    expect(decision.killSwitchPassed).toBe(false);
  });

  it("blocks on block_entry action", () => {
    const config = makeConfig({ allowRealExecution: true });
    const context = makePassingContext({
      killSwitchDecision: {
        allowed: false,
        action: "block_entry",
        reasons: ["Blocking entry"],
        state: { status: "triggered", action: "block_entry", reasons: ["critical_risk"], triggeredAt: 0, updatedAt: 0 },
        generatedAt: 0,
      },
    });
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(false);
    expect(decision.killSwitchPassed).toBe(false);
  });

  it("allows when kill switch is active and allowing", () => {
    const config = makeConfig({ allowRealExecution: true });
    const context = makePassingContext();
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.killSwitchPassed).toBe(true);
  });
});

describe("TinyTradeGuard — Balance Check", () => {
  it("blocks when balance is below max position size", () => {
    const config = makeConfig({ allowRealExecution: true, maxPositionUsd: 50 });
    const context = makePassingContext({ availableBalanceUsd: 10 });
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(false);
    expect(decision.balancePassed).toBe(false);
    expect(decision.reasons.some((r) => r.includes("balance"))).toBe(true);
  });

  it("passes when balance exceeds max position size", () => {
    const config = makeConfig({ allowRealExecution: true, maxPositionUsd: 50 });
    const context = makePassingContext({ availableBalanceUsd: 500 });
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(true);
    expect(decision.balancePassed).toBe(true);
  });
});

describe("TinyTradeGuard — API Permission", () => {
  it("blocks when API has no trade permission", () => {
    const config = makeConfig({ allowRealExecution: true });
    const context = makePassingContext({ apiHasTradePermission: false });
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(false);
    expect(decision.permissionPassed).toBe(false);
    expect(decision.reasons.some((r) => r.includes("permission"))).toBe(true);
  });
});

describe("TinyTradeGuard — Reconciliation", () => {
  it("blocks when reconciliation has mismatches", () => {
    const config = makeConfig({ allowRealExecution: true });
    const context = makePassingContext({ reconciliationHasMismatches: true });
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(false);
    expect(decision.reconciliationPassed).toBe(false);
    expect(decision.reasons.some((r) => r.includes("reconciliation"))).toBe(true);
  });
});

describe("TinyTradeGuard — Manual Confirmation", () => {
  it("blocks when manual confirmation is missing", () => {
    const config = makeConfig({ allowRealExecution: true, requireManualConfirmation: true });
    const context = makePassingContext({ hasManualConfirmation: false });
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(false);
    expect(decision.confirmationPassed).toBe(false);
    expect(decision.reasons.some((r) => r.includes("confirmation"))).toBe(true);
  });

  it("passes when manual confirmation is not required", () => {
    const config = makeConfig({ allowRealExecution: true, requireManualConfirmation: false });
    const context = makePassingContext({ hasManualConfirmation: false });
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(true);
    expect(decision.confirmationPassed).toBe(true);
  });
});

describe("TinyTradeGuard — allowRealExecution", () => {
  it("blocks when allowRealExecution is false (default)", () => {
    const config = makeConfig({ allowRealExecution: false });
    const context = makePassingContext();
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(false);
    expect(decision.reasons.some((r) => r.includes("allowRealExecution"))).toBe(true);
  });
});

describe("TinyTradeGuard — Account Sync", () => {
  it("blocks when account sync failed", () => {
    const config = makeConfig({ allowRealExecution: true });
    const context = makePassingContext({ accountSyncSuccess: false });
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(false);
    expect(decision.accountSyncPassed).toBe(false);
    expect(decision.reasons.some((r) => r.includes("Account sync"))).toBe(true);
  });
});

describe("TinyTradeGuard — Multiple Failures", () => {
  it("reports all failure reasons when multiple checks fail", () => {
    const config = makeConfig({ allowRealExecution: false });
    const context = makePassingContext({
      currentCapitalUsd: 200,
      currentOpenPositions: 3,
      availableBalanceUsd: 5,
      apiHasTradePermission: false,
      reconciliationHasMismatches: true,
      hasManualConfirmation: false,
      accountSyncSuccess: false,
      riskDecision: { action: "block_entry", level: "critical", categories: [], reasons: ["test"], generatedAt: 0 },
      killSwitchDecision: {
        allowed: false,
        action: "block_all",
        reasons: ["Locked"],
        state: { status: "locked", action: "block_all", reasons: ["operator_lock"], lockedAt: 0, updatedAt: 0 },
        generatedAt: 0,
      },
    });
    const decision = evaluateTinyTradeGuard(config, context);

    expect(decision.allowed).toBe(false);
    expect(decision.reasons.length).toBeGreaterThanOrEqual(8);
    expect(decision.capitalLimit).toBe(false);
    expect(decision.positionLimit).toBe(false);
    expect(decision.riskPassed).toBe(false);
    expect(decision.killSwitchPassed).toBe(false);
    expect(decision.balancePassed).toBe(false);
    expect(decision.permissionPassed).toBe(false);
    expect(decision.reconciliationPassed).toBe(false);
    expect(decision.confirmationPassed).toBe(false);
    expect(decision.accountSyncPassed).toBe(false);
  });
});
