/**
 * Testnet Readiness Checklist Tests — Phase 5.25
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTestnetReadinessChecklist, summarizeReadinessByCategory } from "./testnetReadinessChecklist";

// ─── Basic Structure ─────────────────────────────────────

describe("buildTestnetReadinessChecklist", () => {
  const result = buildTestnetReadinessChecklist();

  it("has at least 20 items", () => {
    expect(result.total).toBeGreaterThanOrEqual(20);
  });

  it("has source = testnet-readiness-checklist", () => {
    expect(result.source).toBe("testnet-readiness-checklist");
  });

  it("has ready = false in Phase 5.25", () => {
    expect(result.ready).toBe(false);
  });

  it("has requiredBlocked > 0", () => {
    expect(result.requiredBlocked).toBeGreaterThan(0);
  });

  it("all items have unique ids", () => {
    const ids = result.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all items have a category", () => {
    for (const item of result.items) {
      expect(item.category).toBeTruthy();
    }
  });
});

// ─── Pass Items ──────────────────────────────────────────

describe("already completed items are pass", () => {
  const result = buildTestnetReadinessChecklist();

  const passIds = [
    "env-config",
    "env-integration",
    "route-skeleton",
    "guard-skeleton",
    "idempotency-skeleton",
    "rate-limit-skeleton",
    "request-validation",
    "runtime-smoke-tests",
    "no-mainnet-boundary",
    "secret-policy",
    "secret-no-client",
    "permission-skeleton",
    "signing-policy",
    "adapter-skeleton",
    "risk-gate-skeleton",
    "audit-skeleton",
    "middleware-readonly",
  ];

  for (const id of passIds) {
    it(`${id} is pass`, () => {
      const item = result.items.find((i) => i.id === id);
      expect(item).toBeDefined();
      expect(item!.status).toBe("pass");
    });
  }
});

// ─── Blocked Items ───────────────────────────────────────

describe("critical blocked/not-started items", () => {
  const result = buildTestnetReadinessChecklist();

  const blockedOrNotStarted = [
    "middleware-allowlist",
    "secret-server-retrieval",
    "real-permission-verification",
    "signing-implementation",
    "real-binance-adapter",
    "rollback-plan",
    "audit-persistent",
    "ops-approval",
  ];

  for (const id of blockedOrNotStarted) {
    it(`${id} is blocked or not-started`, () => {
      const item = result.items.find((i) => i.id === id);
      expect(item).toBeDefined();
      expect(["blocked", "not-started"]).toContain(item!.status);
    });
  }
});

// ─── Required Items ──────────────────────────────────────

describe("required items blocking readiness", () => {
  const result = buildTestnetReadinessChecklist();

  it("requiredBlocked equals count of required non-pass items", () => {
    const manualCount = result.items.filter((i) => i.required && i.status !== "pass").length;
    expect(result.requiredBlocked).toBe(manualCount);
  });

  it("some blocked items are required", () => {
    const blockedRequired = result.items.filter((i) => i.status === "blocked" && i.required);
    expect(blockedRequired.length).toBeGreaterThan(0);
  });
});

// ─── Category Summary ────────────────────────────────────

describe("summarizeReadinessByCategory", () => {
  const result = buildTestnetReadinessChecklist();
  const summary = summarizeReadinessByCategory(result);

  it("returns summary for each category", () => {
    const categories = Object.keys(summary);
    expect(categories.length).toBeGreaterThanOrEqual(5);
  });

  it("env category has the most items", () => {
    expect(summary.env.total).toBeGreaterThan(3);
  });

  it("all category totals add up to total items", () => {
    const categoryTotal = Object.values(summary).reduce((sum, s) => sum + s.total, 0);
    expect(categoryTotal).toBe(result.total);
  });
});

// ─── Total Counts ────────────────────────────────────────

describe("result totals are consistent", () => {
  const result = buildTestnetReadinessChecklist();

  it("passed + failed + blocked + notStarted = total", () => {
    expect(result.passed + result.failed + result.blocked + result.notStarted).toBe(result.total);
  });

  it("passed > 10 (many items already complete)", () => {
    expect(result.passed).toBeGreaterThan(10);
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("testnetReadinessChecklist — static analysis", () => {
  const files = ["testnetReadinessChecklist.ts", "testnetReadinessTypes.ts"];

  for (const file of files) {
    const content = readFileSync(join(__dirname, file), "utf8");
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    it(`${file} does not contain fetch(`, () => {
      expect(noComments).not.toContain("fetch(");
    });

    it(`${file} does not contain axios`, () => {
      expect(content).not.toContain("axios");
    });

    it(`${file} does not contain decryptSecret / importMasterKey`, () => {
      expect(content).not.toContain("decryptSecret");
      expect(content).not.toContain("importMasterKey");
    });

    it(`${file} does not contain createHmac`, () => {
      expect(content).not.toContain("createHmac");
    });
  }
});
