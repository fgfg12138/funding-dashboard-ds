/**
 * Real Permission Verification Types — Phase 6.3 Design Only
 *
 * Types for evaluating readiness to call exchange permission endpoints.
 * No actual API calls, no secret reading, no decryption, no signing.
 */

// ─── Policy Input ────────────────────────────────────────

export type RealPermissionVerificationPolicyInput = {
  exchangeId: string;
  environment: string;
  vaultPolicyAllowed: boolean;
  auditPersistenceReady: boolean;
  killSwitchDisabled: boolean;
  routeName: string;
  phase: "6.3-permission-design";
};

// ─── Policy Result ───────────────────────────────────────

export type RealPermissionVerificationPolicyResult = {
  allowedToVerify: boolean;
  severity: "blocked" | "warning" | "info";
  reasonCodes: string[];
  messages: string[];
  source: "real-permission-verification-design";
};
