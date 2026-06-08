/**
 * Persistent Audit Repository Tests — Phase 6.10
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDisabledPersistentAuditRepository } from "./persistentAuditRepository";

const repo = createDisabledPersistentAuditRepository();

// ─── Source ──────────────────────────────────────────────

describe("disabled repository — source", () => {
  it("source is persistent-audit-disabled", () => {
    expect(repo.source).toBe("persistent-audit-disabled");
  });
});

// ─── appendEvent ─────────────────────────────────────────

describe("disabled repository — appendEvent", () => {
  it("returns success=false", async () => {
    const result = await repo.appendEvent({
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

// ─── getEventById ────────────────────────────────────────

describe("disabled repository — getEventById", () => {
  it("returns null", async () => {
    const result = await repo.getEventById("any-id");
    expect(result).toBeNull();
  });
});

// ─── listEvents ──────────────────────────────────────────

describe("disabled repository — listEvents", () => {
  it("returns empty array", async () => {
    const result = await repo.listEvents();
    expect(result).toEqual([]);
  });

  it("returns empty array with filters", async () => {
    const result = await repo.listEvents({ eventType: "test", limit: 10 });
    expect(result).toEqual([]);
  });
});

// ─── verifyIntegrity ─────────────────────────────────────

describe("disabled repository — verifyIntegrity", () => {
  it("returns implemented=false", async () => {
    const result = await repo.verifyIntegrity();
    expect(result.implemented).toBe(false);
    expect(result.valid).toBe(false);
  });
});

// ─── exportEvents ────────────────────────────────────────

describe("disabled repository — exportEvents", () => {
  it("returns implemented=false", async () => {
    const result = await repo.exportEvents();
    expect(result.implemented).toBe(false);
    expect(result.eventCount).toBe(0);
    expect(result.data).toBe("[]");
  });
});

// ─── pruneExpiredEvents ──────────────────────────────────

describe("disabled repository — pruneExpiredEvents", () => {
  it("returns prunedCount=0", async () => {
    const result = await repo.pruneExpiredEvents({ env: "local", retentionDays: 7 });
    expect(result.prunedCount).toBe(0);
    expect(result.remainingCount).toBe(0);
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("disabled repository — static analysis", () => {
  const content = readFileSync(join(__dirname, "persistentAuditRepository.ts"), "utf8");
  const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("does not import sqlite", () => {
    expect(content).not.toContain("sqlite");
  });

  it("does not import postgres", () => {
    expect(content).not.toContain("postgres");
  });

  it("does not import prisma", () => {
    expect(content).not.toContain("prisma");
  });

  it("does not use fs", () => {
    expect(content).not.toContain("require('fs')");
    expect(content).not.toContain("import.*fs");
    expect(content).not.toContain("writeFile");
    expect(content).not.toContain("appendFile");
    expect(content).not.toContain("readFile");
  });

  it("does not contain fetch(", () => {
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
