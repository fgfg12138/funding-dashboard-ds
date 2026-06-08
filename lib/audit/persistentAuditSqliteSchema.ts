/**
 * Persistent Audit SQLite Schema — Phase 6.11 Design Only
 *
 * Pure functions that generate SQL CREATE TABLE statements
 * for the persistent audit storage layer.
 *
 * No database connection. No SQL execution. No file writes.
 * No ORM imports.
 */

import type { PersistentAuditTableName } from "./persistentAuditTypes";

// ─── SQLite Schema Version ───────────────────────────────

export type AuditSqliteMigrationStep = {
  version: number;
  name: string;
  statements: string[];
  reversible: boolean;
  source: "persistent-audit-sqlite-schema-design";
};

export type AuditSqliteMigrationPlan = {
  steps: AuditSqliteMigrationStep[];
};

// ─── Table Names ─────────────────────────────────────────

const TABLE_NAMES: PersistentAuditTableName[] = [
  "audit_events",
  "audit_event_metadata",
  "audit_integrity_checks",
];

/**
 * Get the list of persistent audit SQLite table names.
 */
export function getPersistentAuditSqliteTables(): PersistentAuditTableName[] {
  return [...TABLE_NAMES];
}

// ─── CREATE TABLE Statements ─────────────────────────────

/**
 * Build the SQL CREATE TABLE statement for audit_events.
 *
 * Columns:
 * - id TEXT PRIMARY KEY
 * - event_type TEXT NOT NULL
 * - actor TEXT NOT NULL
 * - route_name TEXT
 * - exchange_id TEXT
 * - entity_type TEXT
 * - entity_id TEXT
 * - severity TEXT NOT NULL
 * - message TEXT NOT NULL
 * - metadata_hash TEXT NOT NULL
 * - source TEXT NOT NULL
 * - created_at INTEGER NOT NULL
 */
export function buildCreateAuditEventsTableSql(): string {
  return `
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  route_name TEXT,
  exchange_id TEXT,
  entity_type TEXT,
  entity_id TEXT,
  severity TEXT NOT NULL CHECK(severity IN ('info', 'warning', 'blocked', 'error')),
  message TEXT NOT NULL,
  metadata_hash TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`.trim();
}

/**
 * Build the SQL CREATE TABLE statement for audit_event_metadata.
 *
 * Columns:
 * - id TEXT PRIMARY KEY
 * - event_id TEXT NOT NULL REFERENCES audit_events(id)
 * - key TEXT NOT NULL
 * - value TEXT NOT NULL (JSON-serialized)
 *
 * Forbidden keys are NOT enforced at the DB level — they are
 * sanitized by the application layer before storage.
 */
export function buildCreateAuditMetadataTableSql(): string {
  return `
CREATE TABLE IF NOT EXISTS audit_event_metadata (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES audit_events(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL
);
`.trim();
}

/**
 * Build the SQL CREATE TABLE statement for audit_integrity_checks.
 *
 * Columns:
 * - id TEXT PRIMARY KEY
 * - last_event_id TEXT REFERENCES audit_events(id)
 * - last_metadata_hash TEXT NOT NULL
 * - event_count INTEGER NOT NULL
 * - cumulative_hash TEXT NOT NULL
 * - checked_at INTEGER NOT NULL
 */
export function buildCreateAuditIntegrityTableSql(): string {
  return `
CREATE TABLE IF NOT EXISTS audit_integrity_checks (
  id TEXT PRIMARY KEY,
  last_event_id TEXT REFERENCES audit_events(id),
  last_metadata_hash TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  cumulative_hash TEXT NOT NULL,
  checked_at INTEGER NOT NULL
);
`.trim();
}

// ─── Migration Plan ──────────────────────────────────────

/**
 * Build the full migration plan for creating persistent audit tables.
 */
export function buildAuditSqliteMigrationPlan(): AuditSqliteMigrationPlan {
  return {
    steps: [
      {
        version: 1,
        name: "create_persistent_audit_tables",
        statements: [
          buildCreateAuditEventsTableSql(),
          buildCreateAuditMetadataTableSql(),
          buildCreateAuditIntegrityTableSql(),
        ],
        reversible: false,
        source: "persistent-audit-sqlite-schema-design",
      },
    ],
  };
}

// ─── Schema Validation ───────────────────────────────────

export type AuditSchemaValidationResult = {
  valid: boolean;
  errors: string[];
};

/**
 * Validate a migration plan to ensure it covers all required tables.
 */
export function validateAuditSqliteSchemaPlan(
  plan: AuditSqliteMigrationPlan,
): AuditSchemaValidationResult {
  const errors: string[] = [];

  if (!plan.steps || plan.steps.length === 0) {
    errors.push("Migration plan must have at least one step");
    return { valid: false, errors };
  }

  const allSql = plan.steps.flatMap((s) => s.statements).join("\n");

  for (const table of TABLE_NAMES) {
    if (!allSql.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
      errors.push(`Missing CREATE TABLE statement for: ${table}`);
    }
  }

  // Check that forbidden column names do NOT appear in the schema
  const forbiddenColumns = ["secret", "api_secret", "private_key", "password", "signature", "raw_body"];
  for (const col of forbiddenColumns) {
    if (allSql.toLowerCase().includes(col)) {
      errors.push(`Forbidden column name found in schema: ${col}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
