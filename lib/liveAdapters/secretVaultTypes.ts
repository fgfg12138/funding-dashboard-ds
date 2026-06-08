/**
 * Server Secret Vault Types — Phase 6.2 Design Only
 *
 * Defines vault provider types and secret access policy types.
 * No actual secret reading, no decryption, no signing.
 */

// ─── Vault Provider ──────────────────────────────────────

export type SecretVaultProvider = "disabled" | "env-encrypted" | "managed-kms";

// ─── Policy Input ────────────────────────────────────────

export type SecretVaultPolicyInput = {
  provider: SecretVaultProvider;
  exchangeId: string;
  environment: string;
  routeName: string;
  auditPersistenceReady: boolean;
  killSwitchDisabled: boolean;
  phase: "6.2-vault-design";
};

// ─── Policy Result ───────────────────────────────────────

export type SecretVaultPolicyResult = {
  allowedToAccessVault: boolean;
  severity: "blocked" | "warning" | "info";
  reasonCodes: string[];
  messages: string[];
  source: "secret-vault-policy-design";
};
