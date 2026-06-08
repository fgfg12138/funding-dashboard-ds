# Persistent Audit SQLite Schema Design

> **Phase 6.11 — Design Only**
> **Status: ✅ Completed — No database connection**
> **Blocker: Persistent Audit Implementation (schema design step)**
> **NO-GO decision unchanged**

---

## What This Is

SQL schema design for the persistent audit storage layer. Pure SQL string generation — no database connection, no file writes, no migration execution.

---

## SQLite Schema

### `audit_events`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT | PRIMARY KEY |
| `event_type` | TEXT | NOT NULL |
| `actor` | TEXT | NOT NULL |
| `route_name` | TEXT | |
| `exchange_id` | TEXT | |
| `entity_type` | TEXT | |
| `entity_id` | TEXT | |
| `severity` | TEXT | NOT NULL, CHECK(info/warning/blocked/error) |
| `message` | TEXT | NOT NULL |
| `metadata_hash` | TEXT | NOT NULL |
| `source` | TEXT | NOT NULL |
| `created_at` | INTEGER | NOT NULL |

### `audit_event_metadata`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT | PRIMARY KEY |
| `event_id` | TEXT | NOT NULL REFERENCES audit_events(id) |
| `key` | TEXT | NOT NULL |
| `value` | TEXT | NOT NULL (JSON-serialized) |

> **Forbidden fields enforced by application layer:** secret, api_secret, private_key, password, signature, raw_body

### `audit_integrity_checks`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT | PRIMARY KEY |
| `last_event_id` | TEXT | REFERENCES audit_events(id) |
| `last_metadata_hash` | TEXT | NOT NULL |
| `event_count` | INTEGER | NOT NULL |
| `cumulative_hash` | TEXT | NOT NULL |
| `checked_at` | INTEGER | NOT NULL |

---

## Migration Plan

| Field | Value |
|-------|-------|
| Version | 1 |
| Name | `create_persistent_audit_tables` |
| Statements | 3 (one per table) |
| Reversible | No |
| Source | `persistent-audit-sqlite-schema-design` |

---

## Output Functions

| Function | Returns |
|----------|---------|
| `getPersistentAuditSqliteTables()` | `["audit_events", "audit_event_metadata", "audit_integrity_checks"]` |
| `buildCreateAuditEventsTableSql()` | SQL string for `audit_events` |
| `buildCreateAuditMetadataTableSql()` | SQL string for `audit_event_metadata` |
| `buildCreateAuditIntegrityTableSql()` | SQL string for `audit_integrity_checks` |
| `buildAuditSqliteMigrationPlan()` | Migration plan object with statement array |
| `validateAuditSqliteSchemaPlan(plan)` | `{ valid: boolean, errors: string[] }` |

---

## What This Is NOT

| Not this | Reason |
|----------|--------|
| ❌ SQLite driver import | No `sqlite` / `better-sqlite3` |
| ❌ ORM import | No `prisma` |
| ❌ File system writes | No `fs` |
| ❌ SQL execution | Statements are strings only |
| ❌ Real audit storage | Still using in-memory store |
| ❌ Real testnet capability | All routes still 403 |

---

## Current Status

| Check | Status |
|-------|--------|
| SQL CREATE statements generated as pure strings | ✅ |
| All 3 tables covered | ✅ |
| Forbidden columns excluded | ✅ |
| Migration plan valid | ✅ |
| Database connected | ❌ |
| Real testnet changed | ❌ (still 403) |
| Readiness | ❌ STILL NOT READY |
