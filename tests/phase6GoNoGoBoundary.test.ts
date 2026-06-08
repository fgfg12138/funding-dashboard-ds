/**
 * Phase 6.8 Go/No-Go Boundary Tests
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildGoNoGoReview } from "@/lib/liveAdapters/goNoGoReview";

const root = process.cwd();
function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

// ─── Doc Exists ──────────────────────────────────────────

describe("Phase 6.8 — Go/No-Go Doc Exists", () => {
  const doc = read("docs/PHASE_6_8_GO_NO_GO_REVIEW.md");
  it("exists and has content", () => {
    expect(doc.length).toBeGreaterThan(0);
  });
});

// ─── Doc Content ─────────────────────────────────────────

describe("Phase 6.8 — Go/No-Go Doc Content", () => {
  const doc = read("docs/PHASE_6_8_GO_NO_GO_REVIEW.md");

  it("declares NO-GO", () => {
    expect(doc).toContain("NO-GO");
  });

  it("declares no-real-testnet", () => {
    expect(doc).toContain("所有 /api/testnet route 仍返回 403");
  });

  it("declares no-mainnet", () => {
    expect(doc).toContain("主网始终禁止");
  });

  it("lists Phase 6.9 as remediation plan only", () => {
    expect(doc).toContain("Phase 6.9");
    expect(doc).toContain("NO-GO remediation plan");
  });
});

// ─── Go/No-Go Result ─────────────────────────────────────

describe("Phase 6.8 — Go/No-Go Result", () => {
  const review = buildGoNoGoReview();

  it("decision is NO_GO", () => {
    expect(review.decision).toBe("NO_GO");
  });

  it("readyForRealTestnet is false", () => {
    expect(review.readyForRealTestnet).toBe(false);
  });

  it("requiredBlocked > 0", () => {
    expect(review.requiredBlocked).toBeGreaterThan(0);
  });

  it("total >= 20", () => {
    expect(review.total).toBeGreaterThanOrEqual(20);
  });
});

// ─── Route Files Still Blocked ──────────────────────────

describe("Phase 6.8 — Route Files Still Blocked", () => {
  const routes = [
    "app/api/testnet/orders/preview-submit/route.ts",
    "app/api/testnet/orders/cancel/route.ts",
    "app/api/testnet/orders/[id]/route.ts",
    "app/api/testnet/account/snapshot/route.ts",
  ];

  for (const f of routes) {
    const content = read(f);
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    it(`${f} no success: true`, () => expect(noComments).not.toContain("success: true"));
  }
});

// ─── Middleware ──────────────────────────────────────────

describe("Phase 6.8 — Middleware Not Modified", () => {
  it("/api/testnet not in allowlist", () => {
    const mw = read("middleware.ts");
    const paths = mw.match(/\/api\/[a-z-]+/g) || [];
    expect(paths.find((p) => p.includes("testnet"))).toBeUndefined();
  });
});

// ─── No Forbidden Code in liveAdapters Go/No-Go Files ─

describe("Phase 6.8 — No Forbidden Code in Go/No-Go Files", () => {
  const files = [
    "lib/liveAdapters/goNoGoReview.ts",
    "lib/liveAdapters/goNoGoReviewTypes.ts",
  ];

  for (const f of files) {
    const content = read(f);
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const name = f.replace(/.*\//, "");

    it(`${name} no fetch(`, () => expect(noComments).not.toContain("fetch("));
    it(`${name} no axios`, () => expect(content).not.toContain("axios"));
    it(`${name} no decryptSecret`, () => expect(content).not.toContain("decryptSecret"));
    it(`${name} no importMasterKey`, () => expect(content).not.toContain("importMasterKey"));
    it(`${name} no createHmac`, () => expect(content).not.toContain("createHmac"));
    it(`${name} no crypto.subtle.sign`, () => expect(content).not.toContain("crypto.subtle.sign"));
    it(`${name} no exchange SDK`, () => {
      const imports = content.split("\n").filter((l) => l.includes("import "));
      for (const line of imports) {
        expect(line).not.toMatch(/@binance|binance-api|okx-api|bybit-api|ccxt/i);
      }
    });
  }
});
