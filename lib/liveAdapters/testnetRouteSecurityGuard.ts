/**
 * Testnet Route Security Guard Skeleton — Phase 5.10
 *
 * Pure function to evaluate the testnet route security checklist.
 * No network requests, no secret decryption, no signing.
 * Even with all checks passing, the guard returns blocked in Phase 5.10.
 */

import type {
  TestnetRouteSecurityChecklist,
  TestnetRouteErrorCode,
  TestnetRouteSecurityGuardInput,
  TestnetRouteSecurityGuardResult,
} from "./testnetRouteTypes";

// ─── Rule Mapping ────────────────────────────────────────

type Rule = {
  field: keyof TestnetRouteSecurityChecklist;
  errorCode: TestnetRouteErrorCode;
  message: string;
};

const RULES: Rule[] = [
  { field: "exchangeEnvValid", errorCode: "exchange-env-invalid", message: "EXCHANGE_ENV is not 'testnet'" },
  { field: "liveTradingBlocked", errorCode: "live-trading-enabled", message: "LIVE_TRADING_ENABLED must be false" },
  { field: "mainnetBlocked", errorCode: "mainnet-allowed", message: "ALLOW_MAINNET_TRADING must be false" },
  { field: "killSwitchDisabled", errorCode: "kill-switch-active", message: "Kill Switch is active" },
  { field: "apiKeyVerified", errorCode: "api-key-not-verified", message: "API Key not verified" },
  { field: "withdrawPermissionDisabled", errorCode: "withdraw-not-disabled", message: "Withdraw permission not disabled" },
  { field: "ipWhitelistPresent", errorCode: "ip-whitelist-missing", message: "IP whitelist not present" },
  { field: "riskGatePassed", errorCode: "risk-gate-blocked", message: "Risk Gate blocked the request" },
  { field: "confirmationExists", errorCode: "confirmation-missing", message: "User confirmation not provided" },
  { field: "queueItemNotExpired", errorCode: "queue-expired", message: "Queue item has expired" },
];

/**
 * Evaluate the security checklist for a testnet route request.
 *
 * Returns blocked if any checklist field fails.
 * Returns blocked in Phase 5.10 even if all checks pass.
 *
 * @param input - The security guard input with checklist, route name, exchange ID, and phase.
 * @returns The evaluation result with blocked/warning status and reason codes.
 */
export function evaluateTestnetRouteSecurityGuard(input: TestnetRouteSecurityGuardInput): TestnetRouteSecurityGuardResult {
  const { checklist, routeName, exchangeId, now } = input;

  const failures: { errorCode: TestnetRouteErrorCode; message: string }[] = [];

  for (const rule of RULES) {
    if (!checklist[rule.field]) {
      failures.push({ errorCode: rule.errorCode, message: rule.message });
    }
  }

  if (failures.length > 0) {
    return {
      allowed: false,
      severity: "blocked",
      errorCode: failures[0].errorCode,
      reasonCodes: failures.map((f) => f.errorCode),
      messages: failures.map((f) => f.message),
      source: "testnet-route-skeleton",
    };
  }

  // Even with all checks passing, Phase 5.10 blocks everything
  return {
    allowed: false,
    severity: "blocked",
    errorCode: "internal-error",
    reasonCodes: ["PHASE_5_10_SKELETON_BLOCK"],
    messages: ["Testnet route disabled in Phase 5.10 skeleton — no real order placement"],
    source: "testnet-route-skeleton",
  };
}
