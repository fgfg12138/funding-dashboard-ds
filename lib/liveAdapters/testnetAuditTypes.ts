/**
 * Testnet Audit Server Event Types — Phase 5.14 Skeleton
 *
 * Defines audit event types for testnet route request/block tracking.
 * No secret storage, no network calls, no real trading data.
 */

// ─── Event Type ──────────────────────────────────────────

export type TestnetAuditEventType =
  | "route_request_received"
  | "route_request_blocked"
  | "route_rate_limited"
  | "route_duplicate_blocked"
  | "route_skeleton_blocked";

// ─── Severity ────────────────────────────────────────────

export type TestnetAuditSeverity = "info" | "warning" | "blocked" | "error";

// ─── Audit Event ─────────────────────────────────────────

export type TestnetAuditMetadata = Record<string, string | number | boolean | null>;

export type TestnetAuditEvent = {
  id: string;
  eventType: TestnetAuditEventType;
  routeName: string;
  method: string;
  exchangeId: string;
  requestId: string;
  idempotencyKey?: string;
  clientOrderId?: string;
  severity: TestnetAuditSeverity;
  errorCode?: string;
  message: string;
  metadata: TestnetAuditMetadata;
  createdAt: number;
  source: "testnet-route-skeleton";
};

// ─── Input ───────────────────────────────────────────────

export type TestnetAuditEventInput = {
  eventType: TestnetAuditEventType;
  routeName: string;
  method: string;
  exchangeId: string;
  requestId: string;
  idempotencyKey?: string;
  clientOrderId?: string;
  severity: TestnetAuditSeverity;
  errorCode?: string;
  message: string;
  metadata?: TestnetAuditMetadata;
};

// ─── Filters ─────────────────────────────────────────────

export type TestnetAuditEventFilters = {
  routeName?: string;
  eventType?: TestnetAuditEventType;
  severity?: TestnetAuditSeverity;
  exchangeId?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
};

// ─── Count ───────────────────────────────────────────────

export type TestnetAuditEventCountByType = Record<TestnetAuditEventType, number>;
