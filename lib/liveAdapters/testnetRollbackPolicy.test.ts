/**
 * Testnet Rollback Policy Tests — Phase 6.5
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateTestnetRollbackPolicy } from "./testnetRollbackPolicy";
import type { TestnetRollbackPolicyInput } from "./testnetRollbackTypes";

const BASE: TestnetRollbackPolicyInput = {
  exchangeId: "binance",
  environment: "testnet",
  orderStatus: "submitted",
  killSwitchEnabled: false,
  auditPersistenceReady: true,
  operatorConfirmed: true,
  phase: "6.5-rollback-design",
};

function make(overrides?: Partial<TestnetRollbackPolicyInput>): TestnetRollbackPolicyInput {
  return { ...BASE, ...overrides };
}

describe("evaluateTestnetRollbackPolicy", () => {
  // ─── Prerequisite Blocks ──────────────────────────────

  it("blocks when environment is not testnet", () => {
    const r = evaluateTestnetRollbackPolicy(make({ environment: "production" }));
    expect(r.allowedToRollback).toBe(false);
    expect(r.reasonCodes).toContain("ENVIRONMENT_NOT_TESTNET");
    expect(r.source).toBe("testnet-rollback-plan-design");
  });

  it("blocks when auditPersistenceReady is false", () => {
    const r = evaluateTestnetRollbackPolicy(make({ auditPersistenceReady: false }));
    expect(r.allowedToRollback).toBe(false);
    expect(r.reasonCodes).toContain("AUDIT_PERSISTENCE_NOT_READY");
  });

  it("blocks when operatorConfirmed is false", () => {
    const r = evaluateTestnetRollbackPolicy(make({ operatorConfirmed: false }));
    expect(r.allowedToRollback).toBe(false);
    expect(r.reasonCodes).toContain("OPERATOR_NOT_CONFIRMED");
  });

  // ─── Kill Switch ──────────────────────────────────────

  it("adds freeze and notify actions when killSwitchEnabled", () => {
    const r = evaluateTestnetRollbackPolicy(make({ killSwitchEnabled: true, orderStatus: "submitted" }));
    expect(r.actions).toContain("freeze-further-submissions");
    expect(r.actions).toContain("notify-operator");
    expect(r.actions).toContain("cancel-order-planned");
  });

  it("adds reconciliation when killSwitch enabled with partial", () => {
    const r = evaluateTestnetRollbackPolicy(make({ killSwitchEnabled: true, orderStatus: "partial" }));
    expect(r.actions).toContain("reconciliation-required");
  });

  // ─── Order Status → Actions ──────────────────────────

  it("unknown status plans cancel-order-planned", () => {
    const r = evaluateTestnetRollbackPolicy(make({ orderStatus: "unknown" }));
    expect(r.actions).toContain("cancel-order-planned");
  });

  it("submitted status plans cancel-order-planned", () => {
    const r = evaluateTestnetRollbackPolicy(make({ orderStatus: "submitted" }));
    expect(r.actions).toContain("cancel-order-planned");
  });

  it("partial status plans cancel-order-planned + reconciliation", () => {
    const r = evaluateTestnetRollbackPolicy(make({ orderStatus: "partial" }));
    expect(r.actions).toContain("cancel-order-planned");
    expect(r.actions).toContain("reconciliation-required");
    expect(r.actions).toContain("notify-operator");
  });

  it("filled status plans reconciliation-required", () => {
    const r = evaluateTestnetRollbackPolicy(make({ orderStatus: "filled" }));
    expect(r.actions).toContain("reconciliation-required");
  });

  // ─── Happy Path Still Blocked ─────────────────────────

  it("blocks with PHASE_6_5_ROLLBACK_DISABLED even when all checks pass", () => {
    const r = evaluateTestnetRollbackPolicy(make());
    expect(r.allowedToRollback).toBe(false);
    expect(r.reasonCodes).toContain("PHASE_6_5_ROLLBACK_DISABLED");
    expect(r.severity).toBe("info");
  });

  // ─── Source ──────────────────────────────────────────

  it("source is always testnet-rollback-plan-design", () => {
    expect(evaluateTestnetRollbackPolicy(make()).source).toBe("testnet-rollback-plan-design");
    expect(evaluateTestnetRollbackPolicy(make({ environment: "disabled" })).source).toBe("testnet-rollback-plan-design");
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("testnetRollbackPolicy — static analysis", () => {
  const files = ["testnetRollbackPolicy.ts", "testnetRollbackTypes.ts"];

  for (const file of files) {
    const content = readFileSync(join(__dirname, file), "utf8");
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    it(`${file} no fetch(`, () => expect(noComments).not.toContain("fetch("));
    it(`${file} no axios`, () => expect(content).not.toContain("axios"));
    it(`${file} no decryptSecret`, () => expect(content).not.toContain("decryptSecret"));
    it(`${file} no importMasterKey`, () => expect(content).not.toContain("importMasterKey"));
    it(`${file} no createHmac`, () => expect(content).not.toContain("createHmac"));
  }
});
