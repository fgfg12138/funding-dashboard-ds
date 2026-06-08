/**
 * Persistent Audit Migration Planner Tests — Phase 6.13
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPersistentAuditMigrationDryRun,
  validatePersistentAuditMigrationDryRun,
  summarizePersistentAuditMigrationDryRun,
} from "./persistentAuditMigrationPlanner";
import type { PersistentAuditMigrationDryRunInput } from "./persistentAuditMigrationPlannerTypes";

const BASE_INPUT: PersistentAuditMigrationDryRunInput = {
  target: "sqlite",
  currentVersion: 0,
  targetVersion: 1,
  allowExecution: false,
  source: "persistent-audit-migration-dry-run",
};

function makeInput(
  overrides?: Partial<PersistentAuditMigrationDryRunInput>,
): PersistentAuditMigrationDryRunInput {
  return { ...BASE_INPUT, ...overrides };
}

// ─── Success Path ────────────────────────────────────────

describe("buildPersistentAuditMigrationDryRun — success", () => {
  const result = buildPersistentAuditMigrationDryRun(makeInput());

  it("executable is false", () => {
    expect(result.executable).toBe(false);
  });

  it("valid is true", () => {
    expect(result.valid).toBe(true);
  });

  it("source is persistent-audit-migration-dry-run", () => {
    expect(result.source).toBe("persistent-audit-migration-dry-run");
  });

  it("creates planned-only steps", () => {
    expect(result.steps.length).toBeGreaterThan(0);
    for (const step of result.steps) {
      expect(step.executionStatus).toBe("planned-only");
    }
  });

  it("steps have required fields", () => {
    for (const step of result.steps) {
      expect(step.id).toBeTruthy();
      expect(step.version).toBeGreaterThan(0);
      expect(step.name).toBeTruthy();
      expect(step.statementCount).toBeGreaterThan(0);
    }
  });
});

// ─── Validation Rules ────────────────────────────────────

describe("buildPersistentAuditMigrationDryRun — invalid inputs", () => {
  it("allowExecution=true makes valid=false", () => {
    const result = buildPersistentAuditMigrationDryRun(
      makeInput({ allowExecution: true as any }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("allowExecution"))).toBe(true);
  });

  it("unsupported target makes valid=false", () => {
    const result = buildPersistentAuditMigrationDryRun(
      makeInput({ target: "postgres" as any }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Unsupported target"))).toBe(true);
  });

  it("targetVersion <= currentVersion makes valid=false", () => {
    const result = buildPersistentAuditMigrationDryRun(
      makeInput({ currentVersion: 1, targetVersion: 1 }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("targetVersion"))).toBe(true);
  });
});

// ─── validatePersistentAuditMigrationDryRun ──────────────

describe("validatePersistentAuditMigrationDryRun", () => {
  it("passes for valid result", () => {
    const result = buildPersistentAuditMigrationDryRun(makeInput());
    const validated = validatePersistentAuditMigrationDryRun(result);
    expect(validated.valid).toBe(true);
  });

  it("detects executable=true", () => {
    const result = buildPersistentAuditMigrationDryRun(makeInput());
    const tampered = { ...result, executable: true as any };
    const validated = validatePersistentAuditMigrationDryRun(tampered);
    expect(validated.valid).toBe(false);
  });
});

// ─── summarizePersistentAuditMigrationDryRun ─────────────

describe("summarizePersistentAuditMigrationDryRun", () => {
  const result = buildPersistentAuditMigrationDryRun(makeInput());
  const summary = summarizePersistentAuditMigrationDryRun(result);

  it("executable is false", () => {
    expect(summary.executable).toBe(false);
  });

  it("totalSteps matches result steps length", () => {
    expect(summary.totalSteps).toBe(result.steps.length);
  });

  it("totalStatements > 0", () => {
    expect(summary.totalStatements).toBeGreaterThan(0);
  });

  it("valid matches result valid", () => {
    expect(summary.valid).toBe(result.valid);
  });

  it("errors count matches", () => {
    expect(summary.errors).toBe(result.errors.length);
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("persistentAuditMigrationPlanner — static analysis", () => {
  const files = ["persistentAuditMigrationPlanner.ts", "persistentAuditMigrationPlannerTypes.ts"];

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
