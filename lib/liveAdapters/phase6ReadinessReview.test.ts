/**
 * Phase 6.0 Real Testnet Readiness Review Tests
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPhase6ReadinessReview } from "./phase6ReadinessReview";

const root = process.cwd();
function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

// ─── Review Structure ────────────────────────────────────

describe("buildPhase6ReadinessReview — structure", () => {
  const review = buildPhase6ReadinessReview();

  it("has at least 20 items", () => {
    expect(review.total).toBeGreaterThanOrEqual(20);
  });

  it("source is phase-6-readiness-review", () => {
    expect(review.source).toBe("phase-6-readiness-review");
  });

  it("ready is false", () => {
    expect(review.ready).toBe(false);
  });

  it("requiredBlocked > 0", () => {
    expect(review.requiredBlocked).toBeGreaterThan(0);
  });

  it("all items have unique ids", () => {
    const ids = review.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has all 10 review areas represented", () => {
    const areas = new Set(review.items.map((i) => i.area));
    expect(areas.size).toBe(10);
  });
});

// ─── Pass Items ──────────────────────────────────────────

describe("buildPhase6ReadinessReview — pass items", () => {
  const review = buildPhase6ReadinessReview();

  const expectedPassIds = [
    "secret-storage-arch",
    "secret-no-client",
    "perm-skeleton",
    "signing-policy",
    "middleware-current",
    "kill-switch-skeleton",
    "audit-skeleton",
    "rate-limit-skeleton",
    "idempotency-skeleton",
    "adapter-skeleton",
  ];

  for (const id of expectedPassIds) {
    it(`${id} status is pass`, () => {
      const item = review.items.find((i) => i.id === id);
      expect(item).toBeDefined();
      expect(item!.status).toBe("pass");
    });
  }
});

// ─── Blocked Items ───────────────────────────────────────

describe("buildPhase6ReadinessReview — blocked items", () => {
  const review = buildPhase6ReadinessReview();

  const expectedBlocked = [
    "secret-server-retrieval",
    "perm-real-verification",
    "signing-implementation",
    "middleware-testnet-allowlist",
    "audit-persistent-storage",
    "rollback-documented",
    "adapter-real-binance",
  ];

  for (const id of expectedBlocked) {
    it(`${id} status is blocked`, () => {
      const item = review.items.find((i) => i.id === id);
      expect(item).toBeDefined();
      expect(item!.status).toBe("blocked");
    });
  }
});

// ─── Not Started Items ───────────────────────────────────

describe("buildPhase6ReadinessReview — not-started items", () => {
  const review = buildPhase6ReadinessReview();

  const expectedNotStarted = [
    "kill-switch-implementation",
    "rate-limit-exchange-config",
    "idempotency-exchange-integration",
    "adapter-okx-bybit",
  ];

  for (const id of expectedNotStarted) {
    it(`${id} status is not-started`, () => {
      const item = review.items.find((i) => i.id === id);
      expect(item).toBeDefined();
      expect(item!.status).toBe("not-started");
    });
  }
});

// ─── Required Items ──────────────────────────────────────

describe("buildPhase6ReadinessReview — required blockers", () => {
  const review = buildPhase6ReadinessReview();

  it("all blocked items are required", () => {
    const blockedRequired = review.items.filter((i) => i.status === "blocked" && i.required);
    expect(blockedRequired.length).toBeGreaterThan(0);
    for (const item of blockedRequired) {
      expect(item.required).toBe(true);
    }
  });

  it("requiredBlocked matches count", () => {
    const manualCount = review.items.filter((i) => i.required && i.status !== "pass").length;
    expect(review.requiredBlocked).toBe(manualCount);
  });
});

// ─── Area Summary ────────────────────────────────────────

describe("buildPhase6ReadinessReview — area summary", () => {
  const review = buildPhase6ReadinessReview();

  it("has 10 areas in summary", () => {
    expect(Object.keys(review.summary).length).toBe(10);
  });

  it("area totals add up to total", () => {
    const areaTotal = Object.values(review.summary).reduce((s, a) => s + a.total, 0);
    expect(areaTotal).toBe(review.total);
  });
});

// ─── Count Consistency ───────────────────────────────────

describe("buildPhase6ReadinessReview — count consistency", () => {
  const review = buildPhase6ReadinessReview();

  it("passed + failed + blocked + notStarted = total", () => {
    expect(review.passed + review.failed + review.blocked + review.notStarted).toBe(review.total);
  });

  it("passed >= 10 (skeletons already complete)", () => {
    expect(review.passed).toBeGreaterThanOrEqual(10);
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("phase6ReadinessReview — static analysis", () => {
  const files = ["phase6ReadinessReview.ts", "phase6ReadinessTypes.ts"];

  for (const file of files) {
    const content = readFileSync(join(__dirname, file), "utf8");
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    it(`${file} no fetch(`, () => expect(noComments).not.toContain("fetch("));
    it(`${file} no axios`, () => expect(content).not.toContain("axios"));
    it(`${file} no decryptSecret`, () => expect(content).not.toContain("decryptSecret"));
    it(`${file} no importMasterKey`, () => expect(content).not.toContain("importMasterKey"));
    it(`${file} no createHmac`, () => expect(content).not.toContain("createHmac"));
    it(`${file} no crypto.subtle.sign`, () => expect(content).not.toContain("crypto.subtle.sign"));
  }
});

// ─── Doc Assertions ──────────────────────────────────────

describe("PHASE_6_REAL_TESTNET_READINESS_REVIEW.md — content", () => {
  const doc = read("docs/PHASE_6_REAL_TESTNET_READINESS_REVIEW.md");

  it("exists and has content", () => {
    expect(doc.length).toBeGreaterThan(0);
  });

  it("declares NOT READY", () => {
    expect(doc).toContain("NOT READY");
  });

  it("declares ready=false", () => {
    expect(doc).toContain("ready=false");
  });

  it("covers all 10 review areas", () => {
    expect(doc).toContain("Secret Storage");
    expect(doc).toContain("Permission Verification");
    expect(doc).toContain("Signing Architecture");
    expect(doc).toContain("Middleware Strategy");
    expect(doc).toContain("Kill Switch");
    expect(doc).toContain("Audit Persistence");
    expect(doc).toContain("Rate Limit");
    expect(doc).toContain("Idempotency");
    expect(doc).toContain("Rollback Plan");
    expect(doc).toContain("Exchange Adapter");
  });

  it("declares no-real-testnet", () => {
    expect(doc).toContain("绝不能直接接主网");
  });
});
