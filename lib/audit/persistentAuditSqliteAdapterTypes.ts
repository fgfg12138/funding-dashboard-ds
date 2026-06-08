/**
 * Persistent Audit SQLite Adapter Types — Phase 6.12 Disabled Skeleton
 *
 * Types for the disabled SQLite adapter.
 * No database connection, no SQL execution, no file writes.
 */

// ─── Adapter Mode ────────────────────────────────────────

export type PersistentAuditSqliteMode = "disabled";

// ─── Adapter Config ──────────────────────────────────────

export type PersistentAuditSqliteAdapterConfig = {
  mode: PersistentAuditSqliteMode;
  /** Optional file path — never used when mode=disabled. */
  dbPath?: string;
  migrationsEnabled: false;
  source: "persistent-audit-sqlite-disabled";
};

// ─── Adapter Status ──────────────────────────────────────

export type PersistentAuditSqliteStatus = {
  mode: PersistentAuditSqliteMode;
  connected: boolean;
  dbPath?: string;
  migrationsEnabled: false;
  source: "persistent-audit-sqlite-disabled";
};

// ─── Connect Result ──────────────────────────────────────

export type PersistentAuditSqliteConnectResult = {
  success: boolean;
  error: string;
};

// ─── Migration Result ────────────────────────────────────

export type PersistentAuditSqliteMigrationResult = {
  success: boolean;
  version?: number;
  error: string;
};
