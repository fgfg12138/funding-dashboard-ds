/**
 * Server Secret Vault Policy Tests — Phase 6.2
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateSecretVaultPolicy } from "./secretVaultPolicy";
import type { SecretVaultPolicyInput } from "./secretVaultTypes";

const BASE_INPUT: SecretVaultPolicyInput = {
  provider: "env-encrypted",
  exchangeId: "binance",
  environment: "testnet",
  routeName: "orders-preview-submit",
  auditPersistenceReady: true,
  killSwitchDisabled: true,
  phase: "6.2-vault-design",
};

function makeInput(overrides?: Partial<SecretVaultPolicyInput>): SecretVaultPolicyInput {
  return { ...BASE_INPUT, ...overrides };
}

// ─── Provider Disabled ───────────────────────────────────

describe("evaluateSecretVaultPolicy", () => {
  it("blocks when provider is disabled", () => {
    const result = evaluateSecretVaultPolicy(makeInput({ provider: "disabled" }));
    expect(result.allowedToAccessVault).toBe(false);
    expect(result.reasonCodes).toContain("VAULT_PROVIDER_DISABLED");
    expect(result.severity).toBe("blocked");
    expect(result.source).toBe("secret-vault-policy-design");
  });

  // ─── Environment ────────────────────────────────────

  it("blocks when environment is not testnet", () => {
    const result = evaluateSecretVaultPolicy(makeInput({ environment: "production" }));
    expect(result.allowedToAccessVault).toBe(false);
    expect(result.reasonCodes).toContain("ENVIRONMENT_NOT_TESTNET");
  });

  it("allows when environment is testnet", () => {
    const result = evaluateSecretVaultPolicy(makeInput({ environment: "testnet" }));
    expect(result.reasonCodes).not.toContain("ENVIRONMENT_NOT_TESTNET");
  });

  // ─── Audit Persistence ──────────────────────────────

  it("blocks when auditPersistenceReady is false", () => {
    const result = evaluateSecretVaultPolicy(makeInput({ auditPersistenceReady: false }));
    expect(result.allowedToAccessVault).toBe(false);
    expect(result.reasonCodes).toContain("AUDIT_PERSISTENCE_NOT_READY");
  });

  // ─── Kill Switch ────────────────────────────────────

  it("blocks when killSwitchDisabled is false", () => {
    const result = evaluateSecretVaultPolicy(makeInput({ killSwitchDisabled: false }));
    expect(result.allowedToAccessVault).toBe(false);
    expect(result.reasonCodes).toContain("KILL_SWITCH_ACTIVE");
  });

  // ─── Multiple Failures ──────────────────────────────

  it("aggregates multiple failure reasons", () => {
    const result = evaluateSecretVaultPolicy(
      makeInput({ provider: "disabled", environment: "production", auditPersistenceReady: false, killSwitchDisabled: false }),
    );
    expect(result.reasonCodes.length).toBeGreaterThanOrEqual(4);
    expect(result.reasonCodes).toContain("VAULT_PROVIDER_DISABLED");
    expect(result.reasonCodes).toContain("ENVIRONMENT_NOT_TESTNET");
    expect(result.reasonCodes).toContain("AUDIT_PERSISTENCE_NOT_READY");
    expect(result.reasonCodes).toContain("KILL_SWITCH_ACTIVE");
  });

  // ─── Happy Path Still Blocked ───────────────────────

  it("blocks with PHASE_6_2_VAULT_ACCESS_DISABLED even when all checks pass", () => {
    const result = evaluateSecretVaultPolicy(makeInput());
    expect(result.allowedToAccessVault).toBe(false);
    expect(result.reasonCodes).toContain("PHASE_6_2_VAULT_ACCESS_DISABLED");
    expect(result.severity).toBe("info");
  });

  // ─── Source ──────────────────────────────────────────

  it("source is always secret-vault-policy-design", () => {
    const r1 = evaluateSecretVaultPolicy(makeInput());
    expect(r1.source).toBe("secret-vault-policy-design");

    const r2 = evaluateSecretVaultPolicy(makeInput({ provider: "disabled" }));
    expect(r2.source).toBe("secret-vault-policy-design");
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("secretVaultPolicy — static analysis", () => {
  const files = ["secretVaultPolicy.ts", "secretVaultTypes.ts"];

  for (const file of files) {
    const content = readFileSync(join(__dirname, file), "utf8");
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    it(`${file} does not contain decryptSecret`, () => {
      expect(content).not.toContain("decryptSecret");
    });
    it(`${file} does not contain importMasterKey`, () => {
      expect(content).not.toContain("importMasterKey");
    });
    it(`${file} does not contain fetch(`, () => {
      expect(noComments).not.toContain("fetch(");
    });
    it(`${file} does not contain axios`, () => {
      expect(content).not.toContain("axios");
    });
    it(`${file} does not contain createHmac`, () => {
      expect(content).not.toContain("createHmac");
    });
    it(`${file} does not contain apiKeyStore`, () => {
      expect(content).not.toContain("apiKeyStore");
    });
  }
});
