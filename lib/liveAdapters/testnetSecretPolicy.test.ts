/**
 * Testnet Secret Access Policy Tests — Phase 5.18
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateTestnetSecretAccessPolicy } from "./testnetSecretPolicy";
import type {
  TestnetSecretAccessPolicyInput,
} from "./testnetSecretPolicyTypes";
import type { TestnetEnvConfig, TestnetEnvConfigValidationResult } from "./testnetEnvTypes";
import type { TestnetRouteSecurityGuardResult } from "./testnetRouteTypes";

const VALID_ENV_CONFIG: TestnetEnvConfig = {
  exchangeEnv: "testnet",
  liveTradingEnabled: false,
  allowMainnetTrading: false,
  testnetRoutesEnabled: true,
  testnetOrderSubmitEnabled: false,
};

const VALID_ENV_VALIDATION: TestnetEnvConfigValidationResult = {
  valid: true,
  errors: [],
  warnings: [],
};

const VALID_GUARD_RESULT: TestnetRouteSecurityGuardResult = {
  allowed: true,
  severity: "info",
  errorCode: undefined,
  reasonCodes: [],
  messages: [],
  source: "testnet-route-skeleton",
};

function makeInput(
  overrides?: Partial<TestnetSecretAccessPolicyInput>,
): TestnetSecretAccessPolicyInput {
  return {
    exchangeId: "binance",
    envConfig: VALID_ENV_CONFIG,
    envValidation: VALID_ENV_VALIDATION,
    guardResult: VALID_GUARD_RESULT,
    routeName: "orders-preview-submit",
    phase: "5.18-policy-only",
    ...overrides,
  };
}

// ─── Individual Rules ────────────────────────────────────

describe("evaluateTestnetSecretAccessPolicy", () => {
  it("blocks when envValidation.valid is false", () => {
    const result = evaluateTestnetSecretAccessPolicy(
      makeInput({ envValidation: { ...VALID_ENV_VALIDATION, valid: false, errors: ["invalid"] } }),
    );
    expect(result.allowedToRequestSecret).toBe(false);
    expect(result.reasonCodes).toContain("ENV_VALIDATION_FAILED");
    expect(result.severity).toBe("blocked");
    expect(result.source).toBe("testnet-secret-policy-skeleton");
  });

  it("blocks when exchangeEnv is not testnet", () => {
    const result = evaluateTestnetSecretAccessPolicy(
      makeInput({ envConfig: { ...VALID_ENV_CONFIG, exchangeEnv: "disabled" } }),
    );
    expect(result.allowedToRequestSecret).toBe(false);
    expect(result.reasonCodes).toContain("EXCHANGE_ENV_NOT_TESTNET");
  });

  it("blocks when testnetRoutesEnabled is false", () => {
    const result = evaluateTestnetSecretAccessPolicy(
      makeInput({ envConfig: { ...VALID_ENV_CONFIG, testnetRoutesEnabled: false } }),
    );
    expect(result.allowedToRequestSecret).toBe(false);
    expect(result.reasonCodes).toContain("TESTNET_ROUTES_DISABLED");
  });

  it("blocks when testnetOrderSubmitEnabled is true", () => {
    const result = evaluateTestnetSecretAccessPolicy(
      makeInput({ envConfig: { ...VALID_ENV_CONFIG, testnetOrderSubmitEnabled: true } }),
    );
    expect(result.allowedToRequestSecret).toBe(false);
    expect(result.reasonCodes).toContain("ORDER_SUBMIT_ENABLED_IN_PHASE_5_18");
  });

  it("blocks when guardResult.allowed is false", () => {
    const result = evaluateTestnetSecretAccessPolicy(
      makeInput({
        guardResult: { ...VALID_GUARD_RESULT, allowed: false, reasonCodes: ["GUARD_REJECTED"] },
      }),
    );
    expect(result.allowedToRequestSecret).toBe(false);
    expect(result.reasonCodes).toContain("GUARD_REJECTED");
  });

  it("blocks with PHASE_5_18_SECRET_ACCESS_BLOCKED even when all checks pass", () => {
    const result = evaluateTestnetSecretAccessPolicy(makeInput());
    expect(result.allowedToRequestSecret).toBe(false);
    expect(result.reasonCodes).toContain("PHASE_5_18_SECRET_ACCESS_BLOCKED");
    expect(result.severity).toBe("info");
  });
});

// ─── Multiple Failures ───────────────────────────────────

describe("multiple failure reasons", () => {
  it("aggregates reasonCodes when multiple rules fail", () => {
    const result = evaluateTestnetSecretAccessPolicy(
      makeInput({
        envConfig: { ...VALID_ENV_CONFIG, exchangeEnv: "disabled", testnetRoutesEnabled: false },
        envValidation: { ...VALID_ENV_VALIDATION, valid: false, errors: ["invalid"] },
      }),
    );
    expect(result.allowedToRequestSecret).toBe(false);
    expect(result.reasonCodes.length).toBeGreaterThanOrEqual(3);
    expect(result.reasonCodes).toContain("ENV_VALIDATION_FAILED");
    expect(result.reasonCodes).toContain("EXCHANGE_ENV_NOT_TESTNET");
    expect(result.reasonCodes).toContain("TESTNET_ROUTES_DISABLED");
  });
});

// ─── Source ──────────────────────────────────────────────

describe("source", () => {
  it("always returns testnet-secret-policy-skeleton", () => {
    const result1 = evaluateTestnetSecretAccessPolicy(makeInput());
    expect(result1.source).toBe("testnet-secret-policy-skeleton");

    const result2 = evaluateTestnetSecretAccessPolicy(
      makeInput({ envConfig: { ...VALID_ENV_CONFIG, exchangeEnv: "disabled" } }),
    );
    expect(result2.source).toBe("testnet-secret-policy-skeleton");
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("testnetSecretPolicy — static analysis", () => {
  const policyContent = readFileSync(join(__dirname, "testnetSecretPolicy.ts"), "utf8");

  it("does not contain fetch(", () => {
    const noComments = policyContent.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(noComments).not.toContain("fetch(");
  });

  it("does not contain axios", () => {
    expect(policyContent).not.toContain("axios");
  });

  it("does not contain createHmac / crypto.subtle.sign", () => {
    expect(policyContent).not.toContain("createHmac");
    expect(policyContent).not.toContain("crypto.subtle.sign");
  });

  it("does not contain decryptSecret / importMasterKey / apiKeyStore", () => {
    expect(policyContent).not.toContain("decryptSecret");
    expect(policyContent).not.toContain("importMasterKey");
    expect(policyContent).not.toContain("apiKeyStore");
  });
});
