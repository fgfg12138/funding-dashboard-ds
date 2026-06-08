/**
 * Go/No-Go Review Tests — Phase 6.8
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildGoNoGoReview } from "./goNoGoReview";

// ─── Basic Structure ─────────────────────────────────────

describe("buildGoNoGoReview", () => {
  const review = buildGoNoGoReview();

  it("has at least 20 items (12 domains)", () => {
    expect(review.total).toBeGreaterThanOrEqual(20);
  });

  it("source is phase-6-8-go-no-go-review", () => {
    expect(review.source).toBe("phase-6-8-go-no-go-review");
  });

  it("decision is NO_GO in Phase 6.8", () => {
    expect(review.decision).toBe("NO_GO");
  });

  it("readyForRealTestnet is false", () => {
    expect(review.readyForRealTestnet).toBe(false);
  });

  it("requiredBlocked > 0", () => {
    expect(review.requiredBlocked).toBeGreaterThan(0);
  });

  it("all items have unique ids", () => {
    const ids = review.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers all 12 domains", () => {
    const domains = new Set(review.items.map((i) => i.domain));
    expect(domains.size).toBe(12);
  });
});

// ─── Pass Items (design completed) ───────────────────────

describe("buildGoNoGoReview — design items are pass", () => {
  const review = buildGoNoGoReview();

  const designPassIds = [
    "secret-vault-design",
    "perm-design",
    "signing-design",
    "audit-design",
    "rollback-design",
    "kill-switch-concept",
    "rate-limit-skeleton",
    "idempotency-skeleton",
    "middleware-current",
    "adapter-skeleton",
    "mainnet-boundary",
    "mainnet-env-config",
  ];

  for (const id of designPassIds) {
    it(`${id} status is pass`, () => {
      const item = review.items.find((i) => i.id === id);
      expect(item).toBeDefined();
      expect(item!.status).toBe("pass");
    });
  }
});

// ─── Blocked Items (design complete, impl blocked) ──────

describe("buildGoNoGoReview — implementation items are blocked", () => {
  const review = buildGoNoGoReview();

  const blockedIds = [
    "secret-vault-impl",
    "perm-impl",
    "signing-impl",
    "audit-impl",
    "rollback-impl",
    "middleware-allowlist",
    "adapter-real",
  ];

  for (const id of blockedIds) {
    it(`${id} status is blocked`, () => {
      const item = review.items.find((i) => i.id === id);
      expect(item).toBeDefined();
      expect(item!.status).toBe("blocked");
    });
  }
});

// ─── Not-Started Items ──────────────────────────────────

describe("buildGoNoGoReview — not-started items", () => {
  const review = buildGoNoGoReview();

  const notStartedIds = [
    "kill-switch-impl",
    "ops-approval",
  ];

  for (const id of notStartedIds) {
    it(`${id} status is not-started`, () => {
      const item = review.items.find((i) => i.id === id);
      expect(item).toBeDefined();
      expect(item!.status).toBe("not-started");
    });
  }
});

// ─── Consistency ─────────────────────────────────────────

describe("buildGoNoGoReview — consistency", () => {
  const review = buildGoNoGoReview();

  it("pass + blocked + notStarted = total", () => {
    expect(review.pass + review.blocked + review.notStarted).toBe(review.total);
  });

  it("pass > 10 (many design items complete)", () => {
    expect(review.pass).toBeGreaterThan(10);
  });

  it("requiredBlocked = count of required non-pass items", () => {
    const manual = review.items.filter((i) => i.required && i.status !== "pass").length;
    expect(review.requiredBlocked).toBe(manual);
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("goNoGoReview — static analysis", () => {
  const files = ["goNoGoReview.ts", "goNoGoReviewTypes.ts"];

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
