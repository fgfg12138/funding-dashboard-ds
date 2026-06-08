/**
 * Real Permission Verification Policy Tests — Phase 6.3
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateRealPermissionVerificationPolicy } from "./realPermissionVerificationPolicy";
import type { RealPermissionVerificationPolicyInput } from "./realPermissionVerificationTypes";

const BASE_INPUT: RealPermissionVerificationPolicyInput = {
  exchangeId: "binance",
  environment: "testnet",
  vaultPolicyAllowed: true,
  auditPersistenceReady: true,
  killSwitchDisabled: true,
  routeName: "orders-preview-submit",
  phase: "6.3-permission-design",
};

function makeInput(overrides?: Partial<RealPermissionVerificationPolicyInput>): RealPermissionVerificationPolicyInput {
  return { ...BASE_INPUT, ...overrides };
}

// ─── Individual Rules ────────────────────────────────────

describe("evaluateRealPermissionVerificationPolicy", () => {
  it("blocks when environment is not testnet", () => {
    const result = evaluateRealPermissionVerificationPolicy(makeInput({ environment: "production" }));
    expect(result.allowedToVerify).toBe(false);
    expect(result.reasonCodes).toContain("ENVIRONMENT_NOT_TESTNET");
    expect(result.severity).toBe("blocked");
    expect(result.source).toBe("real-permission-verification-design");
  });

  it("blocks when vaultPolicyAllowed is false", () => {
    const result = evaluateRealPermissionVerificationPolicy(makeInput({ vaultPolicyAllowed: false }));
    expect(result.allowedToVerify).toBe(false);
    expect(result.reasonCodes).toContain("VAULT_POLICY_NOT_ALLOWED");
  });

  it("blocks when auditPersistenceReady is false", () => {
    const result = evaluateRealPermissionVerificationPolicy(makeInput({ auditPersistenceReady: false }));
    expect(result.allowedToVerify).toBe(false);
    expect(result.reasonCodes).toContain("AUDIT_PERSISTENCE_NOT_READY");
  });

  it("blocks when killSwitchDisabled is false", () => {
    const result = evaluateRealPermissionVerificationPolicy(makeInput({ killSwitchDisabled: false }));
    expect(result.allowedToVerify).toBe(false);
    expect(result.reasonCodes).toContain("KILL_SWITCH_ACTIVE");
  });

  // ─── Multiple Failures ────────────────────────────────

  it("aggregates multiple failure reasons", () => {
    const result = evaluateRealPermissionVerificationPolicy(
      makeInput({ environment: "production", vaultPolicyAllowed: false, auditPersistenceReady: false, killSwitchDisabled: false }),
    );
    expect(result.reasonCodes.length).toBeGreaterThanOrEqual(4);
    expect(result.reasonCodes).toContain("ENVIRONMENT_NOT_TESTNET");
    expect(result.reasonCodes).toContain("VAULT_POLICY_NOT_ALLOWED");
    expect(result.reasonCodes).toContain("AUDIT_PERSISTENCE_NOT_READY");
    expect(result.reasonCodes).toContain("KILL_SWITCH_ACTIVE");
  });

  // ─── Happy Path Still Blocked ─────────────────────────

  it("blocks with PHASE_6_3_PERMISSION_VERIFICATION_DISABLED even when all checks pass", () => {
    const result = evaluateRealPermissionVerificationPolicy(makeInput());
    expect(result.allowedToVerify).toBe(false);
    expect(result.reasonCodes).toContain("PHASE_6_3_PERMISSION_VERIFICATION_DISABLED");
    expect(result.severity).toBe("info");
  });

  // ─── Source ──────────────────────────────────────────

  it("source is always real-permission-verification-design", () => {
    const r1 = evaluateRealPermissionVerificationPolicy(makeInput());
    expect(r1.source).toBe("real-permission-verification-design");

    const r2 = evaluateRealPermissionVerificationPolicy(makeInput({ environment: "disabled" }));
    expect(r2.source).toBe("real-permission-verification-design");
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("realPermissionVerificationPolicy — static analysis", () => {
  const files = ["realPermissionVerificationPolicy.ts", "realPermissionVerificationTypes.ts"];

  for (const file of files) {
    const content = readFileSync(join(__dirname, file), "utf8");
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    it(`${file} does not contain fetch(`, () => expect(noComments).not.toContain("fetch("));
    it(`${file} does not contain axios`, () => expect(content).not.toContain("axios"));
    it(`${file} does not contain decryptSecret`, () => expect(content).not.toContain("decryptSecret"));
    it(`${file} does not contain importMasterKey`, () => expect(content).not.toContain("importMasterKey"));
    it(`${file} does not contain createHmac`, () => expect(content).not.toContain("createHmac"));
    it(`${file} does not contain apiKeyStore`, () => expect(content).not.toContain("apiKeyStore"));
  }
});
