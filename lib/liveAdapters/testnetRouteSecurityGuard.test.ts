/**
 * Testnet Route Security Guard Skeleton Tests — Phase 5.10
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateTestnetRouteSecurityGuard } from "./testnetRouteSecurityGuard";
import type { TestnetRouteSecurityChecklist, TestnetRouteSecurityGuardInput } from "./testnetRouteTypes";

const defaultInput: TestnetRouteSecurityGuardInput = {
  routeName: "orders-preview-submit",
  exchangeId: "binance",
  now: 1_000_000,
  phase: "5.10-skeleton",
  checklist: {
    exchangeEnvValid: false,
    liveTradingBlocked: false,
    mainnetBlocked: false,
    killSwitchDisabled: false,
    apiKeyVerified: false,
    withdrawPermissionDisabled: false,
    ipWhitelistPresent: false,
    riskGatePassed: false,
    confirmationExists: false,
    queueItemNotExpired: false,
  },
};

function makeInput(overrides: Partial<TestnetRouteSecurityChecklist>): TestnetRouteSecurityGuardInput {
  return {
    ...defaultInput,
    checklist: { ...defaultInput.checklist, ...overrides },
  };
}

// ─── Individual Check Failures ───────────────────────────

describe("evaluateTestnetRouteSecurityGuard — individual failures", () => {
  it("exchangeEnvValid false → blocked with exchange-env-invalid", () => {
    const result = evaluateTestnetRouteSecurityGuard(makeInput({ exchangeEnvValid: false }));
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("exchange-env-invalid");
    expect(result.severity).toBe("blocked");
    expect(result.source).toBe("testnet-route-skeleton");
  });

  it("liveTradingBlocked false → blocked with live-trading-enabled", () => {
    const result = evaluateTestnetRouteSecurityGuard(
      makeInput({ exchangeEnvValid: true, liveTradingBlocked: false }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("live-trading-enabled");
  });

  it("mainnetBlocked false → blocked with mainnet-allowed", () => {
    const result = evaluateTestnetRouteSecurityGuard(
      makeInput({ exchangeEnvValid: true, liveTradingBlocked: true, mainnetBlocked: false }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("mainnet-allowed");
  });

  it("killSwitchDisabled false → blocked with kill-switch-active", () => {
    const result = evaluateTestnetRouteSecurityGuard(
      makeInput({ exchangeEnvValid: true, liveTradingBlocked: true, mainnetBlocked: true, killSwitchDisabled: false }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("kill-switch-active");
  });

  it("apiKeyVerified false → blocked with api-key-not-verified", () => {
    const result = evaluateTestnetRouteSecurityGuard(
      makeInput({
        exchangeEnvValid: true, liveTradingBlocked: true, mainnetBlocked: true, killSwitchDisabled: true,
        apiKeyVerified: false,
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("api-key-not-verified");
  });

  it("withdrawPermissionDisabled false → blocked with withdraw-not-disabled", () => {
    const result = evaluateTestnetRouteSecurityGuard(
      makeInput({
        exchangeEnvValid: true, liveTradingBlocked: true, mainnetBlocked: true, killSwitchDisabled: true,
        apiKeyVerified: true, withdrawPermissionDisabled: false,
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("withdraw-not-disabled");
  });

  it("ipWhitelistPresent false → blocked with ip-whitelist-missing", () => {
    const result = evaluateTestnetRouteSecurityGuard(
      makeInput({
        exchangeEnvValid: true, liveTradingBlocked: true, mainnetBlocked: true, killSwitchDisabled: true,
        apiKeyVerified: true, withdrawPermissionDisabled: true, ipWhitelistPresent: false,
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("ip-whitelist-missing");
  });

  it("riskGatePassed false → blocked with risk-gate-blocked", () => {
    const result = evaluateTestnetRouteSecurityGuard(
      makeInput({
        exchangeEnvValid: true, liveTradingBlocked: true, mainnetBlocked: true, killSwitchDisabled: true,
        apiKeyVerified: true, withdrawPermissionDisabled: true, ipWhitelistPresent: true,
        riskGatePassed: false,
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("risk-gate-blocked");
  });

  it("confirmationExists false → blocked with confirmation-missing", () => {
    const result = evaluateTestnetRouteSecurityGuard(
      makeInput({
        exchangeEnvValid: true, liveTradingBlocked: true, mainnetBlocked: true, killSwitchDisabled: true,
        apiKeyVerified: true, withdrawPermissionDisabled: true, ipWhitelistPresent: true,
        riskGatePassed: true, confirmationExists: false,
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("confirmation-missing");
  });

  it("queueItemNotExpired false → blocked with queue-expired", () => {
    const result = evaluateTestnetRouteSecurityGuard(
      makeInput({
        exchangeEnvValid: true, liveTradingBlocked: true, mainnetBlocked: true, killSwitchDisabled: true,
        apiKeyVerified: true, withdrawPermissionDisabled: true, ipWhitelistPresent: true,
        riskGatePassed: true, confirmationExists: true, queueItemNotExpired: false,
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("queue-expired");
  });
});

// ─── Multiple Failures ──────────────────────────────────

describe("evaluateTestnetRouteSecurityGuard — multiple failures", () => {
  it("aggregates multiple reasonCodes", () => {
    const result = evaluateTestnetRouteSecurityGuard(defaultInput);
    expect(result.allowed).toBe(false);
    expect(result.reasonCodes.length).toBe(10);
    expect(result.messages.length).toBe(10);
  });
});

// ─── All Checks Pass → Still Blocked (Phase 5.10) ───────

describe("evaluateTestnetRouteSecurityGuard — all checks pass", () => {
  it("returns blocked with PHASE_5_10_SKELETON_BLOCK even when all checks pass", () => {
    const result = evaluateTestnetRouteSecurityGuard(
      makeInput({
        exchangeEnvValid: true, liveTradingBlocked: true, mainnetBlocked: true, killSwitchDisabled: true,
        apiKeyVerified: true, withdrawPermissionDisabled: true, ipWhitelistPresent: true,
        riskGatePassed: true, confirmationExists: true, queueItemNotExpired: true,
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reasonCodes).toContain("PHASE_5_10_SKELETON_BLOCK");
    expect(result.errorCode).toBe("internal-error");
  });
});

// ─── Source ──────────────────────────────────────────────

describe("evaluateTestnetRouteSecurityGuard — source", () => {
  it("always returns source = testnet-route-skeleton", () => {
    const result1 = evaluateTestnetRouteSecurityGuard(defaultInput);
    expect(result1.source).toBe("testnet-route-skeleton");

    const result2 = evaluateTestnetRouteSecurityGuard(
      makeInput({
        exchangeEnvValid: true, liveTradingBlocked: true, mainnetBlocked: true, killSwitchDisabled: true,
        apiKeyVerified: true, withdrawPermissionDisabled: true, ipWhitelistPresent: true,
        riskGatePassed: true, confirmationExists: true, queueItemNotExpired: true,
      }),
    );
    expect(result2.source).toBe("testnet-route-skeleton");
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("testnetRouteSecurityGuard — static analysis", () => {
  const content = readFileSync(join(__dirname, "testnetRouteSecurityGuard.ts"), "utf8");

  it("does not contain fetch(", () => {
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(noComments).not.toContain("fetch(");
  });

  it("does not contain axios", () => {
    expect(content).not.toContain("axios");
  });

  it("does not contain decryptSecret / importMasterKey", () => {
    expect(content).not.toContain("decryptSecret");
    expect(content).not.toContain("importMasterKey");
  });

  it("does not contain createHmac / HMAC / signature", () => {
    expect(content).not.toContain("createHmac");
    expect(content).not.toContain("HMAC");
    expect(content).not.toContain(".sign(");
  });
});
