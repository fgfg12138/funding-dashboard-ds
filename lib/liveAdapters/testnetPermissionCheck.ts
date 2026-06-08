/**
 * Testnet Permission Check Skeleton — Phase 5.19
 *
 * Simulates API Key permission verification for testnet routes.
 * Does NOT read, decrypt, or sign with any Secret.
 * Does NOT call any exchange API.
 *
 * Rules:
 * 1. secretPolicyResult.allowedToRequestSecret !== true → blocked
 * 2. Default: canRead=false, canTrade=false, canWithdraw=false, ipWhitelistPresent=false
 * 3. Withdraw always disabled in skeleton (canWithdraw is never true)
 * 4. IP whitelist always absent in skeleton (ipWhitelistPresent is never true)
 * 5. Phase 5.19: always blocked with PHASE_5_19_PERMISSION_CHECK_DISABLED
 */

import type {
  TestnetPermissionCheckInput,
  TestnetPermissionCheckResult,
} from "./testnetPermissionTypes";

/**
 * Evaluate the permission check for a testnet route.
 *
 * All permissions are disabled in the skeleton.
 * No API keys are read or verified.
 *
 * @param input - The permission check input.
 * @returns The permission check result with disabled flags.
 */
export function evaluateTestnetPermissionCheck(
  input: TestnetPermissionCheckInput,
): TestnetPermissionCheckResult {
  const { secretPolicyResult } = input;
  const blocks: { reasonCode: string; message: string }[] = [];

  // Rule 1: secret policy must allow
  if (!secretPolicyResult.allowedToRequestSecret) {
    // Inherit the reasonCodes from the secret policy
    for (const rc of secretPolicyResult.reasonCodes) {
      blocks.push({
        reasonCode: rc,
        message: `Secret access denied: ${rc}`,
      });
    }
  }

  // Rule 3: withdraw always disabled in skeleton
  blocks.push({
    reasonCode: "WITHDRAW_DISABLED_IN_SKELETON",
    message: "Withdraw permission disabled in skeleton — never allowed on testnet",
  });

  // Rule 4: IP whitelist always absent in skeleton
  blocks.push({
    reasonCode: "IP_WHITELIST_REQUIRED",
    message: "IP whitelist check required — skeleton defaults to false",
  });

  // Rule 5: Phase 5.19 blocks everything
  blocks.push({
    reasonCode: "PHASE_5_19_PERMISSION_CHECK_DISABLED",
    message: "Permission check disabled in Phase 5.19 skeleton — no real API Key verification",
  });

  return {
    allowed: false,
    canRead: false,
    canTrade: false,
    canWithdraw: false,
    ipWhitelistPresent: false,
    severity: "blocked",
    reasonCodes: blocks.map((b) => b.reasonCode),
    messages: blocks.map((b) => b.message),
    source: "testnet-permission-skeleton",
  };
}
