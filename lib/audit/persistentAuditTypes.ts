/**
 * Persistent Audit Storage Types — Phase 6.1 Design Only
 *
 * Types for the future persistent audit storage layer.
 * No database connection, no ORM imports, no real requests.
 */

// ─── Severity ────────────────────────────────────────────

export type PersistentAuditSeverity = "info" | "warning" | "blocked" | "error";

// ─── Source ──────────────────────────────────────────────

export type PersistentAuditSource =
  | "local"
  | "testnet-route-skeleton"
  | "testnet-route"
  | "risk-gate"
  | "permission-check"
  | "secret-access"
  | "order-lifecycle";

// ─── Table Names ─────────────────────────────────────────

export type PersistentAuditTableName =
  | "audit_events"
  | "audit_event_metadata"
  | "audit_integrity_checks";

// ─── Event ───────────────────────────────────────────────

export type PersistentAuditEvent = {
  id: string;
  eventType: string;
  actor: string;
  routeName?: string;
  exchangeId?: string;
  entityType?: string;
  entityId?: string;
  severity: PersistentAuditSeverity;
  message: string;
  metadataHash: string;
  source: PersistentAuditSource;
  createdAt: number;
};

// ─── Metadata ────────────────────────────────────────────

export type PersistentAuditMetadata = {
  eventId: string;
  key: string;
  value: string; // JSON-serialized
};

// ─── Integrity Check ─────────────────────────────────────

export type PersistentAuditIntegrityCheck = {
  id: string;
  lastEventId: string;
  lastMetadataHash: string;
  eventCount: number;
  cumulativeHash: string;
  checkedAt: number;
};

// ─── Retention Policy ────────────────────────────────────

export type PersistentAuditRetentionPolicy = {
  env: "local" | "staging" | "production";
  retentionDays: number;
  archiveAfterDays?: number;
};

// ─── Create Event Input ──────────────────────────────────

export type CreatePersistentAuditEventInput = {
  eventType: string;
  actor: string;
  routeName?: string;
  exchangeId?: string;
  entityType?: string;
  entityId?: string;
  severity: PersistentAuditSeverity;
  message: string;
  metadata?: Record<string, unknown>;
  source: PersistentAuditSource;
};
