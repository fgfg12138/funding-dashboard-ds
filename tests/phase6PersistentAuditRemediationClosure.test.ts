/**
 * Phase 6.14 Persistent Audit Remediation Closure Tests
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDisabledPersistentAuditRepository } from "@/lib/audit/persistentAuditRepository";
import { createDisabledPersistentAuditSqliteAdapter } from "@/lib/audit/persistentAuditSqliteAdapter";
import { buildPersistentAuditMigrationDryRun } from "@/lib/audit/persistentAuditMigrationPlanner";
import type { PersistentAuditSqliteAdapterConfig } from "@/lib/audit/persistentAuditSqliteAdapterTypes";

const root = process.cwd();
function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

// ─── Closure Doc ────────────────────────────────────────

describe("Phase 6.14 — Closure Doc", () => {
  const doc = read("docs/PERSISTENT_AUDIT_REMEDIATION_CLOSURE.md");
  it("exists", () => { expect(doc.length).toBeGreaterThan(0); });
  it("declares no DB connection", () => { expect(doc).toContain("数据库连接"); expect(doc).toContain("❌ 禁止"); });
  it("declares no SQL execution", () => { expect(doc).toContain("SQL 执行"); expect(doc).toContain("❌ 禁止"); });
  it("declares no fs write", () => { expect(doc).toContain("文件写入"); expect(doc).toContain("❌ 禁止"); });
  it("declares readiness=false", () => { expect(doc).toContain("NOT READY"); });
  it("states audit implementation still blocked", () => { expect(doc).toContain("still blocked"); });
  it("states Phase 6.15 requires human choice", () => { expect(doc).toContain("Phase 6.15"); expect(doc).toContain("人工选择"); });
});

// ─── Disabled Repository ─────────────────────────────────

describe("Phase 6.14 — Disabled Repository", () => {
  const repo = createDisabledPersistentAuditRepository();
  it("appendEvent returns success=false", async () => {
    const r = await repo.appendEvent({ eventType: "t", actor: "s", severity: "info", source: "local", message: "t" });
    expect(r.success).toBe(false);
  });
});

// ─── Disabled SQLite Adapter ────────────────────────────

describe("Phase 6.14 — Disabled SQLite Adapter", () => {
  const config: PersistentAuditSqliteAdapterConfig = { mode: "disabled", migrationsEnabled: false, source: "persistent-audit-sqlite-disabled" };
  const adapter = createDisabledPersistentAuditSqliteAdapter(config);
  it("connect returns success=false", async () => { const r = await adapter.connect(); expect(r.success).toBe(false); });
  it("runMigration returns success=false", async () => { const r = await adapter.runMigration(); expect(r.success).toBe(false); });
});

// ─── Migration Dry-Run ──────────────────────────────────

describe("Phase 6.14 — Migration Dry-Run", () => {
  const result = buildPersistentAuditMigrationDryRun({ target: "sqlite", currentVersion: 0, targetVersion: 1, allowExecution: false, source: "persistent-audit-migration-dry-run" });
  it("executable is false", () => { expect(result.executable).toBe(false); });
  it("steps are planned-only", () => { for (const s of result.steps) expect(s.executionStatus).toBe("planned-only"); });
});

// ─── No Forbidden Imports in Audit Files ────────────────

describe("Phase 6.14 — No Forbidden Imports", () => {
  const files = [
    "lib/audit/persistentAuditRepository.ts", "lib/audit/persistentAuditRepositoryTypes.ts",
    "lib/audit/persistentAuditSqliteSchema.ts",
    "lib/audit/persistentAuditSqliteAdapter.ts", "lib/audit/persistentAuditSqliteAdapterTypes.ts",
    "lib/audit/persistentAuditMigrationPlanner.ts", "lib/audit/persistentAuditMigrationPlannerTypes.ts",
  ];
  for (const f of files) {
    const content = read(f);
    const imports = content.split("\n").filter((l) => l.includes("import ") && l.includes("from"));
    const n = f.replace("lib/audit/", "");
    it(`${n} no sqlite driver`, () => { expect(imports.join(" ")).not.toMatch(/sqlite|better-sqlite3/); });
    it(`${n} no prisma`, () => { expect(imports.join(" ")).not.toContain("prisma"); });
    it(`${n} no fs`, () => { expect(imports.join(" ")).not.toContain("fs"); });
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    it(`${n} no fetch(`, () => { expect(noComments).not.toContain("fetch("); });
    it(`${n} no axios`, () => { expect(content).not.toContain("axios"); });
    it(`${n} no decryptSecret`, () => { expect(content).not.toContain("decryptSecret"); });
    it(`${n} no createHmac`, () => { expect(content).not.toContain("createHmac"); });
  }
});

// ─── Routes Still Blocked ────────────────────────────────

describe("Phase 6.14 — Routes Still Blocked", () => {
  const routes = ["app/api/testnet/orders/preview-submit/route.ts", "app/api/testnet/orders/cancel/route.ts", "app/api/testnet/orders/[id]/route.ts", "app/api/testnet/account/snapshot/route.ts"];
  for (const f of routes) {
    const content = read(f);
    it(`${f} no success:true`, () => { expect(content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")).not.toContain("success: true"); });
  }
});

// ─── Middleware ──────────────────────────────────────────

describe("Phase 6.14 — Middleware Not Modified", () => {
  it("/api/testnet not in allowlist", () => {
    const mw = read("middleware.ts");
    const paths = mw.match(/\/api\/[a-z-]+/g) || [];
    expect(paths.find((p) => p.includes("testnet"))).toBeUndefined();
  });
});
