/**
 * Signing Architecture Types — Phase 6.4 Design Only
 *
 * Types for evaluating readiness to implement server-side signing.
 * No actual signing, no HMAC, no secret reading, no decryption.
 */

// ─── Policy Input ────────────────────────────────────────

export type SigningPolicyInput = {
  exchangeId: string;
  environment: string;
  vaultAccessAllowed: boolean;
  permissionVerificationPassed: boolean;
  auditPersistenceReady: boolean;
  killSwitchDisabled: boolean;
  requestValidationPassed: boolean;
  idempotencyChecked: boolean;
  phase: "6.4-signing-design";
};

// ─── Policy Result ───────────────────────────────────────

export type SigningPolicyResult = {
  allowedToSign: boolean;
  severity: "blocked" | "warning" | "info";
  reasonCodes: string[];
  messages: string[];
  source: "signing-architecture-design";
};
