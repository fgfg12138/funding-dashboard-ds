/**
 * Server Secret Vault Policy — Phase 6.2 Design Only
 *
 * Evaluates whether the server is allowed to access the Secret Vault
 * for a testnet route. Does NOT read, decrypt, or sign with any Secret.
 *
 * Rules:
 * 1. provider === "disabled" → blocked
 * 2. environment !== "testnet" → blocked
 * 3. auditPersistenceReady !== true → blocked
 * 4. killSwitchDisabled !== true → blocked
 * 5. All pass → still blocked (PHASE_6_2_VAULT_ACCESS_DISABLED)
 */

import type {
  SecretVaultPolicyInput,
  SecretVaultPolicyResult,
} from "./secretVaultTypes";

/**
 * Evaluate the secret vault access policy.
 *
 * @param input - Policy input with vault provider, env, and safety flags.
 * @returns Policy result with allowed flag and reason codes.
 */
export function evaluateSecretVaultPolicy(
  input: SecretVaultPolicyInput,
): SecretVaultPolicyResult {
  const { provider, exchangeId, environment, routeName, auditPersistenceReady, killSwitchDisabled } = input;
  const blocks: { reasonCode: string; message: string }[] = [];

  // Rule 1: provider must not be disabled
  if (provider === "disabled") {
    blocks.push({
      reasonCode: "VAULT_PROVIDER_DISABLED",
      message: "Secret Vault provider is 'disabled' — no secret access available",
    });
  }

  // Rule 2: environment must be testnet
  if (environment !== "testnet") {
    blocks.push({
      reasonCode: "ENVIRONMENT_NOT_TESTNET",
      message: `Environment is "${environment}" — must be "testnet" for vault access`,
    });
  }

  // Rule 3: audit persistence must be ready
  if (!auditPersistenceReady) {
    blocks.push({
      reasonCode: "AUDIT_PERSISTENCE_NOT_READY",
      message: "Audit persistence is not ready — vault access requires persistent audit",
    });
  }

  // Rule 4: kill switch must be disabled
  if (!killSwitchDisabled) {
    blocks.push({
      reasonCode: "KILL_SWITCH_ACTIVE",
      message: "Kill Switch is active — vault access blocked",
    });
  }

  if (blocks.length > 0) {
    return {
      allowedToAccessVault: false,
      severity: "blocked",
      reasonCodes: blocks.map((b) => b.reasonCode),
      messages: blocks.map((b) => b.message),
      source: "secret-vault-policy-design",
    };
  }

  // Rule 5: Phase 6.2 still blocks
  return {
    allowedToAccessVault: false,
    severity: "info",
    reasonCodes: ["PHASE_6_2_VAULT_ACCESS_DISABLED"],
    messages: ["All vault policy checks passed — vault access blocked by Phase 6.2 design"],
    source: "secret-vault-policy-design",
  };
}
