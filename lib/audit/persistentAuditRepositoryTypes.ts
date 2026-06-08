/**
 * Persistent Audit Repository Types — Phase 6.10 Preparation
 *
 * Defines the repository interface for persistent audit storage.
 * No database connection, no ORM imports.
 */

import type {
  PersistentAuditEvent,
  PersistentAuditRetentionPolicy,
  CreatePersistentAuditEventInput,
} from "./persistentAuditTypes";

// ─── Event Filters ───────────────────────────────────────

export type PersistentAuditEventFilters = {
  eventType?: string;
  severity?: string;
  actor?: string;
  exchangeId?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
  limit?: number;
  offset?: number;
};

// ─── Append Result ───────────────────────────────────────

export type PersistentAuditAppendResult = {
  success: boolean;
  eventId?: string;
  error?: string;
};

// ─── Verify Result ───────────────────────────────────────

export type PersistentAuditVerifyResult = {
  implemented: boolean;
  valid: boolean;
  checkedAt: number;
  totalEvents: number;
  error?: string;
};

// ─── Export Result ───────────────────────────────────────

export type PersistentAuditExportResult = {
  implemented: boolean;
  eventCount: number;
  format: "json" | "csv";
  data: string;
};

// ─── Prune Result ────────────────────────────────────────

export type PersistentAuditPruneResult = {
  prunedCount: number;
  remainingCount: number;
};

// ─── Repository Interface ────────────────────────────────

export interface PersistentAuditRepository {
  readonly source: string;

  /** Append a new audit event to persistent storage. */
  appendEvent(event: CreatePersistentAuditEventInput): Promise<PersistentAuditAppendResult>;

  /** Get a single event by its ID. */
  getEventById(id: string): Promise<PersistentAuditEvent | null>;

  /** List events matching the given filters. */
  listEvents(filters?: PersistentAuditEventFilters): Promise<PersistentAuditEvent[]>;

  /** Verify integrity of stored events (hash chain check). */
  verifyIntegrity(): Promise<PersistentAuditVerifyResult>;

  /** Export events in the specified format. */
  exportEvents(filters?: PersistentAuditEventFilters): Promise<PersistentAuditExportResult>;

  /** Prune expired events based on retention policy. */
  pruneExpiredEvents(policy: PersistentAuditRetentionPolicy): Promise<PersistentAuditPruneResult>;
}
