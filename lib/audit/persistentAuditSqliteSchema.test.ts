/**
 * Persistent Audit SQLite Schema Tests — Phase 6.11
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getPersistentAuditSqliteTables,
  buildCreateAuditEventsTableSql,
  buildCreateAuditMetadataTableSql,
  buildCreateAuditIntegrityTableSql,
  buildAuditSqliteMigrationPlan,
  validateAuditSqliteSchemaPlan,
} from "./persistentAuditSqliteSchema";

// ─── Tables ──────────────────────────────────────────────

describe("getPersistentAuditSqliteTables", () => {
  const tables = getPersistentAuditSqliteTables();

  it("returns 3 tables", () => {
    expect(tables.length).toBe(3);
  });

  it("includes audit_events", () => {
    expect(tables).toContain("audit_events");
  });

  it("includes audit_event_metadata", () => {
    expect(tables).toContain("audit_event_metadata");
  });

  it("includes audit_integrity_checks", () => {
    expect(tables).toContain("audit_integrity_checks");
  });
});

// ─── SQL Contains Tables ─────────────────────────────────

describe("SQL CREATE TABLE statements", () => {
  const eventsSql = buildCreateAuditEventsTableSql();
  const metadataSql = buildCreateAuditMetadataTableSql();
  const integritySql = buildCreateAuditIntegrityTableSql();

  it("audit_events SQL contains CREATE TABLE IF NOT EXISTS audit_events", () => {
    expect(eventsSql).toContain("CREATE TABLE IF NOT EXISTS audit_events");
  });

  it("audit_event_metadata SQL contains CREATE TABLE IF NOT EXISTS audit_event_metadata", () => {
    expect(metadataSql).toContain("CREATE TABLE IF NOT EXISTS audit_event_metadata");
  });

  it("audit_integrity_checks SQL contains CREATE TABLE IF NOT EXISTS audit_integrity_checks", () => {
    expect(integritySql).toContain("CREATE TABLE IF NOT EXISTS audit_integrity_checks");
  });
});

// ─── audit_events Columns ────────────────────────────────

describe("audit_events columns", () => {
  const sql = buildCreateAuditEventsTableSql();

  const requiredColumns = [
    "id TEXT PRIMARY KEY",
    "event_type TEXT NOT NULL",
    "actor TEXT NOT NULL",
    "route_name TEXT",
    "exchange_id TEXT",
    "entity_type TEXT",
    "entity_id TEXT",
    "severity TEXT NOT NULL",
    "message TEXT NOT NULL",
    "metadata_hash TEXT NOT NULL",
    "source TEXT NOT NULL",
    "created_at INTEGER NOT NULL",
  ];

  for (const col of requiredColumns) {
    it(`contains column: ${col}`, () => {
      expect(sql).toContain(col);
    });
  }
});

// ─── Metadata Table — No Forbidden Columns ──────────────

describe("audit_event_metadata — no forbidden columns", () => {
  const sql = buildCreateAuditMetadataTableSql();

  const forbidden = ["secret", "api_secret", "private_key", "password", "signature", "raw_body"];

  for (const col of forbidden) {
    it(`does not contain column: ${col}`, () => {
      expect(sql.toLowerCase()).not.toContain(col);
    });
  }
});

// ─── Migration Plan ──────────────────────────────────────

describe("buildAuditSqliteMigrationPlan", () => {
  const plan = buildAuditSqliteMigrationPlan();

  it("has one step", () => {
    expect(plan.steps.length).toBe(1);
  });

  const step = plan.steps[0];

  it("step version is 1", () => {
    expect(step.version).toBe(1);
  });

  it("step name is create_persistent_audit_tables", () => {
    expect(step.name).toBe("create_persistent_audit_tables");
  });

  it("step has 3 statements", () => {
    expect(step.statements.length).toBe(3);
  });

  it("step is not reversible", () => {
    expect(step.reversible).toBe(false);
  });

  it("step source is persistent-audit-sqlite-schema-design", () => {
    expect(step.source).toBe("persistent-audit-sqlite-schema-design");
  });
});

// ─── Validate ────────────────────────────────────────────

describe("validateAuditSqliteSchemaPlan", () => {
  it("passes for valid plan", () => {
    const plan = buildAuditSqliteMigrationPlan();
    const result = validateAuditSqliteSchemaPlan(plan);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects plan with no steps", () => {
    const result = validateAuditSqliteSchemaPlan({ steps: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects plan missing a table", () => {
    const result = validateAuditSqliteSchemaPlan({
      steps: [{ version: 1, name: "partial", statements: ["SELECT 1;"], reversible: false, source: "persistent-audit-sqlite-schema-design" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("audit_events"))).toBe(true);
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("persistentAuditSqliteSchema — static analysis", () => {
  const content = readFileSync(join(__dirname, "persistentAuditSqliteSchema.ts"), "utf8");
  const importLines = content.split("\n").filter((l) => l.includes("import ") && l.includes("from"));

  it("does not import sqlite driver", () => {
    expect(importLines.join(" ")).not.toMatch(/sqlite|better-sqlite3/);
  });

  it("does not import better-sqlite3", () => {
    expect(content).not.toContain("better-sqlite3");
  });

  it("does not import prisma", () => {
    expect(content).not.toContain("prisma");
  });

  it("does not import fs", () => {
    for (const line of importLines) {
      expect(line).not.toContain("fs");
    }
  });

  it("does not contain fetch(", () => {
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(noComments).not.toContain("fetch(");
  });

  it("does not contain axios", () => {
    expect(content).not.toContain("axios");
  });

  it("does not contain decryptSecret", () => {
    expect(content).not.toContain("decryptSecret");
  });

  it("does not contain createHmac", () => {
    expect(content).not.toContain("createHmac");
  });
});
