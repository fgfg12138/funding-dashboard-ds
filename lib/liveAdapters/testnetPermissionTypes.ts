/**
 * Testnet Permission Check Types — Phase 5.19 Skeleton
 *
 * Defines the permission check input and result for simulating
 * future API Key permission verification.
 * No actual key reading, no decryption, no signing, no API calls.
 */

import type { TestnetRouteName } from "./testnetRouteTypes";
import type { TestnetSecretAccessPolicyResult } from "./testnetSecretPolicyTypes";

// ─── Permission Input ────────────────────────────────────

export type TestnetPermissionCheckInput = {
  exchangeId: string;
  routeName: TestnetRouteName;
  secretPolicyResult: TestnetSecretAccessPolicyResult;
  phase: "5.19-permission-skeleton";
};

// ─── Permission Result ───────────────────────────────────

export type TestnetPermissionCheckResult = {
  allowed: boolean;
  canRead: boolean;
  canTrade: boolean;
  canWithdraw: boolean;
  ipWhitelistPresent: boolean;
  severity: "blocked" | "warning" | "info";
  reasonCodes: string[];
  messages: string[];
  source: "testnet-permission-skeleton";
};
