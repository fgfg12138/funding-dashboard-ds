/**
 * Signing Policy — Phase 6.4 Design Only
 *
 * Evaluates whether the server is allowed to implement real
 * request signing for testnet order submission.
 * Does NOT implement HMAC, read secrets, decrypt, or sign anything.
 *
 * Rules:
 * 1. environment !== "testnet" → blocked
 * 2. vaultAccessAllowed !== true → blocked
 * 3. permissionVerificationPassed !== true → blocked
 * 4. auditPersistenceReady !== true → blocked
 * 5. killSwitchDisabled !== true → blocked
 * 6. requestValidationPassed !== true → blocked
 * 7. idempotencyChecked !== true → blocked
 * 8. All pass → still blocked (PHASE_6_4_SIGNING_DISABLED)
 */

import type {
  SigningPolicyInput,
  SigningPolicyResult,
} from "./signingArchitectureTypes";

/**
 * Evaluate the signing policy for a testnet route.
 *
 * @param input - Policy input with all safety flags.
 * @returns Policy result with allowed flag and reason codes.
 */
export function evaluateSigningPolicy(
  input: SigningPolicyInput,
): SigningPolicyResult {
  const {
    environment,
    vaultAccessAllowed,
    permissionVerificationPassed,
    auditPersistenceReady,
    killSwitchDisabled,
    requestValidationPassed,
    idempotencyChecked,
  } = input;

  const blocks: { reasonCode: string; message: string }[] = [];

  // Rule 1
  if (environment !== "testnet") {
    blocks.push({ reasonCode: "ENVIRONMENT_NOT_TESTNET", message: `Environment is "${environment}" — must be "testnet"` });
  }

  // Rule 2
  if (!vaultAccessAllowed) {
    blocks.push({ reasonCode: "VAULT_ACCESS_NOT_ALLOWED", message: "Vault access not allowed — cannot access secret for signing" });
  }

  // Rule 3
  if (!permissionVerificationPassed) {
    blocks.push({ reasonCode: "PERMISSION_VERIFICATION_NOT_PASSED", message: "Permission verification not passed — cannot sign without verified permissions" });
  }

  // Rule 4
  if (!auditPersistenceReady) {
    blocks.push({ reasonCode: "AUDIT_PERSISTENCE_NOT_READY", message: "Audit persistence not ready — signing requires persistent audit" });
  }

  // Rule 5
  if (!killSwitchDisabled) {
    blocks.push({ reasonCode: "KILL_SWITCH_ACTIVE", message: "Kill Switch is active — signing blocked" });
  }

  // Rule 6
  if (!requestValidationPassed) {
    blocks.push({ reasonCode: "REQUEST_VALIDATION_NOT_PASSED", message: "Request validation not passed — cannot sign invalid request" });
  }

  // Rule 7
  if (!idempotencyChecked) {
    blocks.push({ reasonCode: "IDEMPOTENCY_NOT_CHECKED", message: "Idempotency not checked — cannot sign without dedup guarantee" });
  }

  if (blocks.length > 0) {
    return {
      allowedToSign: false,
      severity: "blocked",
      reasonCodes: blocks.map((b) => b.reasonCode),
      messages: blocks.map((b) => b.message),
      source: "signing-architecture-design",
    };
  }

  // Rule 8
  return {
    allowedToSign: false,
    severity: "info",
    reasonCodes: ["PHASE_6_4_SIGNING_DISABLED"],
    messages: ["All signing policy checks passed — signing disabled by Phase 6.4 design"],
    source: "signing-architecture-design",
  };
}
