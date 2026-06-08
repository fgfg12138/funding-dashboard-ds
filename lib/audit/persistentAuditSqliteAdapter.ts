/**
 * Persistent Audit SQLite Adapter — Phase 6.12 Disabled Skeleton
 *
 * Disabled skeleton implementation of a SQLite-backed audit adapter.
 * All methods return blocked/no-op results.
 * No database connection. No SQL execution. No file writes.
 */

import type {
  PersistentAuditSqliteAdapterConfig,
  PersistentAuditSqliteStatus,
  PersistentAuditSqliteConnectResult,
  PersistentAuditSqliteMigrationResult,
} from "./persistentAuditSqliteAdapterTypes";
import type {
  PersistentAuditEventFilters,
  PersistentAuditAppendResult,
  PersistentAuditVerifyResult,
} from "./persistentAuditRepositoryTypes";
import type {
  PersistentAuditEvent,
  CreatePersistentAuditEventInput,
} from "./persistentAuditTypes";

const DISABLED_MSG = "sqlite-adapter-disabled";

/**
 * Create a disabled persistent audit SQLite adapter.
 * All methods return disabled/no-op — no real database access.
 *
 * @param config - Adapter config (must have mode="disabled").
 * @returns A disabled SQLite adapter.
 */
export function createDisabledPersistentAuditSqliteAdapter(
  config: PersistentAuditSqliteAdapterConfig,
) {
  if (config.mode !== "disabled") {
    throw new Error("Only disabled mode is supported in Phase 6.12");
  }

  return {
    /** Get the current adapter status. */
    getStatus(): PersistentAuditSqliteStatus {
      return {
        mode: "disabled",
        connected: false,
        dbPath: config.dbPath,
        migrationsEnabled: false,
        source: "persistent-audit-sqlite-disabled",
      };
    },

    /** Attempt to connect to the database — always fails. */
    async connect(): Promise<PersistentAuditSqliteConnectResult> {
      return { success: false, error: DISABLED_MSG };
    },

    /** Disconnect — no-op. */
    async disconnect(): Promise<void> {
      // no-op
    },

    /** Run pending migrations — always fails. */
    async runMigration(): Promise<PersistentAuditSqliteMigrationResult> {
      return { success: false, version: 0, error: DISABLED_MSG };
    },

    /** Append a new audit event — blocked. */
    async appendEvent(_event: CreatePersistentAuditEventInput): Promise<PersistentAuditAppendResult> {
      return { success: false, error: DISABLED_MSG };
    },

    /** List events — returns empty. */
    async listEvents(_filters?: PersistentAuditEventFilters): Promise<PersistentAuditEvent[]> {
      return [];
    },

    /** Verify integrity — not implemented. */
    async verifyIntegrity(): Promise<PersistentAuditVerifyResult> {
      return {
        implemented: false,
        valid: false,
        checkedAt: Date.now(),
        totalEvents: 0,
        error: "Integrity verification not implemented — SQLite adapter disabled",
      };
    },
  };
}
