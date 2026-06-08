/**
 * Testnet Idempotency Store Types — Phase 5.12 Skeleton
 *
 * Records idempotencyKey / clientOrderId / routeName for future dedup.
 * No secret storage, no network calls, no real dedup enforcement.
 */

import type { TestnetRouteName } from "./testnetRouteTypes";

// ─── Idempotency Record ──────────────────────────────────

export type TestnetIdempotencyRecordStatus =
  | "recorded-blocked"
  | "duplicate-blocked"
  | "expired";

export type TestnetIdempotencyRecord = {
  id: string;
  idempotencyKey: string;
  clientOrderId: string;
  routeName: TestnetRouteName;
  exchangeId: string;
  requestHash: string;
  /** Snapshot of the blocked response (never contains secret or real order data) */
  responseSnapshot: TestnetIdempotencyResponseSnapshot;
  status: TestnetIdempotencyRecordStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  source: "testnet-route-skeleton";
};

export type TestnetIdempotencyResponseSnapshot = {
  success: false;
  errorCode: string;
  message: string;
  httpStatus: number;
};

// ─── Input ────────────────────────────────────────────────

export type TestnetIdempotencyInput = {
  idempotencyKey: string;
  clientOrderId: string;
  routeName: TestnetRouteName;
  exchangeId: string;
  /** Raw request fields to hash for dedup comparison */
  requestFields: Record<string, unknown>;
  responseSnapshot: TestnetIdempotencyResponseSnapshot;
};

// ─── Create Result ────────────────────────────────────────

export type TestnetIdempotencyCreateResult = {
  record: TestnetIdempotencyRecord;
  /** True if this was a duplicate (existing non-expired record found) */
  isDuplicate: boolean;
};
