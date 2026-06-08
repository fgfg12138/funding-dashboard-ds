/**
 * Signing Policy Tests — Phase 6.4
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateSigningPolicy } from "./signingPolicy";
import type { SigningPolicyInput } from "./signingArchitectureTypes";

const BASE_INPUT: SigningPolicyInput = {
  exchangeId: "binance",
  environment: "testnet",
  vaultAccessAllowed: true,
  permissionVerificationPassed: true,
  auditPersistenceReady: true,
  killSwitchDisabled: true,
  requestValidationPassed: true,
  idempotencyChecked: true,
  phase: "6.4-signing-design",
};

function makeInput(overrides?: Partial<SigningPolicyInput>): SigningPolicyInput {
  return { ...BASE_INPUT, ...overrides };
}

describe("evaluateSigningPolicy", () => {
  // ─── Individual Rules ──────────────────────────────────

  it("blocks when environment is not testnet", () => {
    const r = evaluateSigningPolicy(makeInput({ environment: "production" }));
    expect(r.allowedToSign).toBe(false);
    expect(r.reasonCodes).toContain("ENVIRONMENT_NOT_TESTNET");
    expect(r.severity).toBe("blocked");
    expect(r.source).toBe("signing-architecture-design");
  });

  it("blocks when vaultAccessAllowed is false", () => {
    const r = evaluateSigningPolicy(makeInput({ vaultAccessAllowed: false }));
    expect(r.allowedToSign).toBe(false);
    expect(r.reasonCodes).toContain("VAULT_ACCESS_NOT_ALLOWED");
  });

  it("blocks when permissionVerificationPassed is false", () => {
    const r = evaluateSigningPolicy(makeInput({ permissionVerificationPassed: false }));
    expect(r.allowedToSign).toBe(false);
    expect(r.reasonCodes).toContain("PERMISSION_VERIFICATION_NOT_PASSED");
  });

  it("blocks when auditPersistenceReady is false", () => {
    const r = evaluateSigningPolicy(makeInput({ auditPersistenceReady: false }));
    expect(r.allowedToSign).toBe(false);
    expect(r.reasonCodes).toContain("AUDIT_PERSISTENCE_NOT_READY");
  });

  it("blocks when killSwitchDisabled is false", () => {
    const r = evaluateSigningPolicy(makeInput({ killSwitchDisabled: false }));
    expect(r.allowedToSign).toBe(false);
    expect(r.reasonCodes).toContain("KILL_SWITCH_ACTIVE");
  });

  it("blocks when requestValidationPassed is false", () => {
    const r = evaluateSigningPolicy(makeInput({ requestValidationPassed: false }));
    expect(r.allowedToSign).toBe(false);
    expect(r.reasonCodes).toContain("REQUEST_VALIDATION_NOT_PASSED");
  });

  it("blocks when idempotencyChecked is false", () => {
    const r = evaluateSigningPolicy(makeInput({ idempotencyChecked: false }));
    expect(r.allowedToSign).toBe(false);
    expect(r.reasonCodes).toContain("IDEMPOTENCY_NOT_CHECKED");
  });

  // ─── Multiple Failures ────────────────────────────────

  it("aggregates all failure reasons", () => {
    const r = evaluateSigningPolicy(makeInput({
      environment: "production",
      vaultAccessAllowed: false,
      permissionVerificationPassed: false,
      auditPersistenceReady: false,
      killSwitchDisabled: false,
      requestValidationPassed: false,
      idempotencyChecked: false,
    }));
    expect(r.reasonCodes.length).toBe(7);
    expect(r.reasonCodes).toContain("ENVIRONMENT_NOT_TESTNET");
    expect(r.reasonCodes).toContain("VAULT_ACCESS_NOT_ALLOWED");
    expect(r.reasonCodes).toContain("PERMISSION_VERIFICATION_NOT_PASSED");
    expect(r.reasonCodes).toContain("AUDIT_PERSISTENCE_NOT_READY");
    expect(r.reasonCodes).toContain("KILL_SWITCH_ACTIVE");
    expect(r.reasonCodes).toContain("REQUEST_VALIDATION_NOT_PASSED");
    expect(r.reasonCodes).toContain("IDEMPOTENCY_NOT_CHECKED");
  });

  // ─── Happy Path Still Blocked ─────────────────────────

  it("blocks with PHASE_6_4_SIGNING_DISABLED even when all checks pass", () => {
    const r = evaluateSigningPolicy(makeInput());
    expect(r.allowedToSign).toBe(false);
    expect(r.reasonCodes).toContain("PHASE_6_4_SIGNING_DISABLED");
    expect(r.severity).toBe("info");
  });

  // ─── Source ──────────────────────────────────────────

  it("source is always signing-architecture-design", () => {
    const r1 = evaluateSigningPolicy(makeInput());
    expect(r1.source).toBe("signing-architecture-design");

    const r2 = evaluateSigningPolicy(makeInput({ environment: "disabled" }));
    expect(r2.source).toBe("signing-architecture-design");
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("signingPolicy — static analysis", () => {
  const files = ["signingPolicy.ts", "signingArchitectureTypes.ts"];

  for (const file of files) {
    const content = readFileSync(join(__dirname, file), "utf8");
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    it(`${file} no createHmac`, () => expect(content).not.toContain("createHmac"));
    it(`${file} no crypto.subtle.sign`, () => expect(content).not.toContain("crypto.subtle.sign"));
    it(`${file} no decryptSecret`, () => expect(content).not.toContain("decryptSecret"));
    it(`${file} no importMasterKey`, () => expect(content).not.toContain("importMasterKey"));
    it(`${file} no fetch(`, () => expect(noComments).not.toContain("fetch("));
    it(`${file} no axios`, () => expect(content).not.toContain("axios"));
    it(`${file} no apiKeyStore`, () => expect(content).not.toContain("apiKeyStore"));
  }
});
