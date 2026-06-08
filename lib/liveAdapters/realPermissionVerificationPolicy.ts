/**
 * Real Permission Verification Policy — Phase 6.3 Design Only
 *
 * Evaluates whether the server is allowed to make real API Key
 * permission verification calls to an exchange testnet endpoint.
 * Does NOT call any exchange API, read, decrypt, or sign.
 *
 * Rules:
 * 1. environment !== "testnet" → blocked
 * 2. vaultPolicyAllowed !== true → blocked
 * 3. auditPersistenceReady !== true → blocked
 * 4. killSwitchDisabled !== true → blocked
 * 5. All pass → still blocked (PHASE_6_3_PERMISSION_VERIFICATION_DISABLED)
 */

import type {
  RealPermissionVerificationPolicyInput,
  RealPermissionVerificationPolicyResult,
} from "./realPermissionVerificationTypes";

/**
 * Evaluate the real permission verification policy.
 *
 * @param input - Policy input with env, vault, audit, and kill switch flags.
 * @returns Policy result with allowed flag and reason codes.
 */
export function evaluateRealPermissionVerificationPolicy(
  input: RealPermissionVerificationPolicyInput,
): RealPermissionVerificationPolicyResult {
  const { environment, vaultPolicyAllowed, auditPersistenceReady, killSwitchDisabled } = input;
  const blocks: { reasonCode: string; message: string }[] = [];

  // Rule 1: environment must be testnet
  if (environment !== "testnet") {
    blocks.push({
      reasonCode: "ENVIRONMENT_NOT_TESTNET",
      message: `Environment is "${environment}" — must be "testnet" for permission verification`,
    });
  }

  // Rule 2: vault policy must allow
  if (!vaultPolicyAllowed) {
    blocks.push({
      reasonCode: "VAULT_POLICY_NOT_ALLOWED",
      message: "Vault policy does not allow secret access — cannot verify permissions",
    });
  }

  // Rule 3: audit persistence must be ready
  if (!auditPersistenceReady) {
    blocks.push({
      reasonCode: "AUDIT_PERSISTENCE_NOT_READY",
      message: "Audit persistence is not ready — permission verification requires persistent audit",
    });
  }

  // Rule 4: kill switch must be disabled
  if (!killSwitchDisabled) {
    blocks.push({
      reasonCode: "KILL_SWITCH_ACTIVE",
      message: "Kill Switch is active — permission verification blocked",
    });
  }

  if (blocks.length > 0) {
    return {
      allowedToVerify: false,
      severity: "blocked",
      reasonCodes: blocks.map((b) => b.reasonCode),
      messages: blocks.map((b) => b.message),
      source: "real-permission-verification-design",
    };
  }

  // Rule 5: Phase 6.3 still blocks
  return {
    allowedToVerify: false,
    severity: "info",
    reasonCodes: ["PHASE_6_3_PERMISSION_VERIFICATION_DISABLED"],
    messages: ["All permission verification policy checks passed — blocked by Phase 6.3 design"],
    source: "real-permission-verification-design",
  };
}
