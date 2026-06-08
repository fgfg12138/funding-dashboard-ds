/**
 * Testnet Permission Check Tests — Phase 5.19
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateTestnetPermissionCheck } from "./testnetPermissionCheck";
import type { TestnetPermissionCheckInput } from "./testnetPermissionTypes";
import type { TestnetSecretAccessPolicyResult } from "./testnetSecretPolicyTypes";

const VALID_SECRET_POLICY: TestnetSecretAccessPolicyResult = {
  allowedToRequestSecret: true,
  severity: "info",
  reasonCodes: [],
  messages: [],
  source: "testnet-secret-policy-skeleton",
};

const BLOCKED_SECRET_POLICY: TestnetSecretAccessPolicyResult = {
  allowedToRequestSecret: false,
  severity: "blocked",
  reasonCodes: ["ENV_VALIDATION_FAILED"],
  messages: ["Environment validation failed"],
  source: "testnet-secret-policy-skeleton",
};

function makeInput(
  overrides?: Partial<TestnetPermissionCheckInput>,
): TestnetPermissionCheckInput {
  return {
    exchangeId: "binance",
    routeName: "orders-preview-submit",
    secretPolicyResult: VALID_SECRET_POLICY,
    phase: "5.19-permission-skeleton",
    ...overrides,
  };
}

// ─── Secret Policy Blocked ───────────────────────────────

describe("evaluateTestnetPermissionCheck", () => {
  it("blocks when secretPolicy blocks", () => {
    const result = evaluateTestnetPermissionCheck(
      makeInput({ secretPolicyResult: BLOCKED_SECRET_POLICY }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reasonCodes).toContain("ENV_VALIDATION_FAILED");
    expect(result.severity).toBe("blocked");
    expect(result.source).toBe("testnet-permission-skeleton");
  });

  // ─── Default Values ────────────────────────────────

  it("returns canRead=false", () => {
    const result = evaluateTestnetPermissionCheck(makeInput());
    expect(result.canRead).toBe(false);
  });

  it("returns canTrade=false", () => {
    const result = evaluateTestnetPermissionCheck(makeInput());
    expect(result.canTrade).toBe(false);
  });

  it("returns canWithdraw=false", () => {
    const result = evaluateTestnetPermissionCheck(makeInput());
    expect(result.canWithdraw).toBe(false);
  });

  it("returns ipWhitelistPresent=false", () => {
    const result = evaluateTestnetPermissionCheck(makeInput());
    expect(result.ipWhitelistPresent).toBe(false);
  });

  // ─── Phase Blocked ────────────────────────────────

  it("blocks with PHASE_5_19_PERMISSION_CHECK_DISABLED even with valid secret policy", () => {
    const result = evaluateTestnetPermissionCheck(makeInput());
    expect(result.allowed).toBe(false);
    expect(result.reasonCodes).toContain("PHASE_5_19_PERMISSION_CHECK_DISABLED");
  });

  it("includes WITHDRAW_DISABLED_IN_SKELETON reason", () => {
    const result = evaluateTestnetPermissionCheck(makeInput());
    expect(result.reasonCodes).toContain("WITHDRAW_DISABLED_IN_SKELETON");
  });

  it("includes IP_WHITELIST_REQUIRED reason", () => {
    const result = evaluateTestnetPermissionCheck(makeInput());
    expect(result.reasonCodes).toContain("IP_WHITELIST_REQUIRED");
  });

  // ─── Source ────────────────────────────────────────

  it("source is testnet-permission-skeleton", () => {
    const result1 = evaluateTestnetPermissionCheck(makeInput());
    expect(result1.source).toBe("testnet-permission-skeleton");

    const result2 = evaluateTestnetPermissionCheck(
      makeInput({ secretPolicyResult: BLOCKED_SECRET_POLICY }),
    );
    expect(result2.source).toBe("testnet-permission-skeleton");
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("testnetPermissionCheck — static analysis", () => {
  const content = readFileSync(join(__dirname, "testnetPermissionCheck.ts"), "utf8");

  it("does not contain fetch(", () => {
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(noComments).not.toContain("fetch(");
  });

  it("does not contain axios", () => {
    expect(content).not.toContain("axios");
  });

  it("does not contain createHmac / crypto.subtle.sign", () => {
    expect(content).not.toContain("createHmac");
    expect(content).not.toContain("crypto.subtle.sign");
  });

  it("does not contain decryptSecret / importMasterKey / apiKeyStore", () => {
    expect(content).not.toContain("decryptSecret");
    expect(content).not.toContain("importMasterKey");
    expect(content).not.toContain("apiKeyStore");
  });
});
