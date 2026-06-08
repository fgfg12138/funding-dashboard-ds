/**
 * Testnet Request Validation Types — Phase 5.20 Skeleton
 *
 * Defines types for validating testnet route request payloads.
 * No actual request submission, no signing, no secret access.
 */

import type { TestnetRouteName, TestnetRouteErrorCode } from "./testnetRouteTypes";

// ─── Validation Input ────────────────────────────────────

export type TestnetRequestValidationInput = {
  routeName: TestnetRouteName;
  method: string;
  /** Raw request payload (parsed JSON body). May be undefined/null. */
  payload: Record<string, unknown> | null | undefined;
  phase: "5.20-request-validation-skeleton";
};

// ─── Validation Result ───────────────────────────────────

export type TestnetRequestValidationResult = {
  valid: boolean;
  severity: "blocked" | "warning" | "info";
  errorCode?: TestnetRouteErrorCode | "invalid-request";
  reasonCodes: string[];
  messages: string[];
  sanitizedPayload?: Record<string, unknown>;
  source: "testnet-request-validation-skeleton";
};
