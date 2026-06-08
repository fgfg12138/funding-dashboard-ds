/**
 * Testnet Secret Access Policy Types — Phase 5.18 Policy Only
 *
 * Defines the policy input and result for determining when
 * the server is allowed to attempt Secret access.
 * No actual secret reading, no decryption, no signing.
 */

import type { TestnetRouteName, TestnetRouteSecurityGuardResult } from "./testnetRouteTypes";
import type { TestnetEnvConfig, TestnetEnvConfigValidationResult } from "./testnetEnvTypes";

// ─── Policy Input ────────────────────────────────────────

export type TestnetSecretAccessPolicyInput = {
  exchangeId: string;
  envConfig: TestnetEnvConfig;
  envValidation: TestnetEnvConfigValidationResult;
  guardResult: TestnetRouteSecurityGuardResult;
  routeName: TestnetRouteName;
  phase: "5.18-policy-only";
};

// ─── Policy Result ───────────────────────────────────────

export type TestnetSecretAccessPolicyResult = {
  allowedToRequestSecret: boolean;
  severity: "blocked" | "warning" | "info";
  reasonCodes: string[];
  messages: string[];
  source: "testnet-secret-policy-skeleton";
};
