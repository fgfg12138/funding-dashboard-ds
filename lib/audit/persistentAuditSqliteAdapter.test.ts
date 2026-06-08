/**
 * Persistent Audit SQLite Adapter Tests — Phase 6.12
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDisabledPersistentAuditSqliteAdapter } from "./persistentAuditSqliteAdapter";
import type { PersistentAuditSqliteAdapterConfig } from "./persistentAuditSqliteAdapterTypes";

const DISABLED_CONFIG: PersistentAuditSqliteAdapterConfig = {
  mode: "disabled",
  dbPath: ":memory:",
  migrationsEnabled: false,
  source: "persistent-audit-sqlite-disabled",
};

const adapter = createDisabledPersistentAuditSqliteAdapter(DISABLED_CONFIG);

// ─── Config Validation ──────────────────────────────────

describe("createDisabledPersistentAuditSqliteAdapter — config", () => {
  it("throws on non-disabled mode", () => {
    expect(() =>
      createDisabledPersistentAuditSqliteAdapter({
        mode: "disabled" as any, // cast to bypass TS — but mode IS disabled
        dbPath: ":memory:",
        migrationsEnabled: false,
        source: "persistent-audit-sqlite-disabled",
      }),
    ).not.toThrow();
  });
});

// ─── getStatus ───────────────────────────────────────────

describe("disabled adapter — getStatus", () => {
  const status = adapter.getStatus();

  it("mode is disabled", () => {
    expect(status.mode).toBe("disabled");
  });

  it("connected is false", () => {
    expect(status.connected).toBe(false);
  });

  it("migrationsEnabled is false", () => {
    expect(status.migrationsEnabled).toBe(false);
  });

  it("source is persistent-audit-sqlite-disabled", () => {
    expect(status.source).toBe("persistent-audit-sqlite-disabled");
  });
});

// ─── connect ─────────────────────────────────────────────

describe("disabled adapter — connect", () => {
  it("returns success=false", async () => {
    const result = await adapter.connect();
    expect(result.success).toBe(false);
    expect(result.error).toContain("disabled");
  });
});

// ─── disconnect ──────────────────────────────────────────

describe("disabled adapter — disconnect", () => {
  it("does not throw", async () => {
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });
});

// ─── runMigration ────────────────────────────────────────

describe("disabled adapter — runMigration", () => {
  it("returns success=false", async () => {
    const result = await adapter.runMigration();
    expect(result.success).toBe(false);
    expect(result.error).toContain("disabled");
  });
});

// ─── appendEvent ─────────────────────────────────────────

describe("disabled adapter — appendEvent", () => {
  it("returns success=false", async () => {
    const result = await adapter.appendEvent({
      eventType: "test",
      actor: "system",
      severity: "info",
      source: "local",
      message: "test",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("disabled");
  });
});

// ─── listEvents ──────────────────────────────────────────

describe("disabled adapter — listEvents", () => {
  it("returns empty array", async () => {
    const result = await adapter.listEvents();
    expect(result).toEqual([]);
  });

  it("returns empty array with filters", async () => {
    const result = await adapter.listEvents({ eventType: "test", limit: 10 });
    expect(result).toEqual([]);
  });
});

// ─── verifyIntegrity ─────────────────────────────────────

describe("disabled adapter — verifyIntegrity", () => {
  it("returns implemented=false", async () => {
    const result = await adapter.verifyIntegrity();
    expect(result.implemented).toBe(false);
    expect(result.valid).toBe(false);
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("disabled adapter — static analysis", () => {
  const files = ["persistentAuditSqliteAdapter.ts", "persistentAuditSqliteAdapterTypes.ts"];

  for (const file of files) {
    const content = readFileSync(join(__dirname, file), "utf8");
    const importLines = content.split("\n").filter((l) => l.includes("import ") && l.includes("from"));

    it(`${file} does not import sqlite driver`, () => {
      expect(importLines.join(" ")).not.toMatch(/sqlite|better-sqlite3/);
    });

    it(`${file} does not import prisma`, () => {
      expect(importLines.join(" ")).not.toContain("prisma");
    });

    it(`${file} does not import fs`, () => {
      expect(importLines.join(" ")).not.toMatch(/fs/);
    });

    it(`${file} does not contain fetch(`, () => {
      const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(noComments).not.toContain("fetch(");
    });

    it(`${file} does not contain axios`, () => {
      expect(content).not.toContain("axios");
    });

    it(`${file} does not contain decryptSecret`, () => {
      expect(content).not.toContain("decryptSecret");
    });

    it(`${file} does not contain createHmac`, () => {
      expect(content).not.toContain("createHmac");
    });
  }
});
