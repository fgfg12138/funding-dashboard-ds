/**
 * Phase 5.27 Full Architecture Review Boundary Tests
 *
 * Verifies the complete Phase 5 architecture boundaries:
 * - Readiness dashboard warns it does NOT enable testnet
 * - Readiness summary returns ready=false
 * - Route files have no forbidden code
 * - liveAdapters have no exchange SDK
 * - Middleware unchanged
 * - blockedResponse never returns success:true
 * - Review doc declares all boundaries
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReadinessSummary } from "@/lib/liveAdapters/testnetReadinessSummary";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

// ─── Readiness Dashboard Warning ─────────────────────────

describe("Phase 5.27 — Readiness Dashboard Warning", () => {
  const page = read("app/testnet-readiness/page.tsx");

  it("contains 'Does NOT enable Testnet'", () => {
    expect(page).toContain("Does NOT enable Testnet");
  });

  it("contains 'Does NOT retrieve Secrets'", () => {
    expect(page).toContain("Does NOT retrieve Secrets");
  });

  it("contains 'Does NOT place orders'", () => {
    expect(page).toContain("Does NOT place orders");
  });

  it("displays 'NOT READY' in the status", () => {
    const pageLower = page.replace(/<[^>]+>/g, " ").toLowerCase();
    expect(pageLower).toContain("not ready");
  });
});

// ─── Readiness Summary ───────────────────────────────────

describe("Phase 5.27 — Readiness Summary", () => {
  const summary = buildReadinessSummary();

  it("returns ready = false", () => {
    expect(summary.ready).toBe(false);
  });

  it("returns requiredBlocked > 0", () => {
    expect(summary.requiredBlocked).toBeGreaterThan(0);
  });

  it("returns total >= 20", () => {
    expect(summary.total).toBeGreaterThanOrEqual(20);
  });

  it("returns pass > 10", () => {
    expect(summary.pass).toBeGreaterThan(10);
  });
});

// ─── No Forbidden Code in Route Files ────────────────────

describe("Phase 5.27 — Route Files No Forbidden Code", () => {
  const ROUTE_FILES = [
    "app/api/testnet/orders/preview-submit/route.ts",
    "app/api/testnet/orders/cancel/route.ts",
    "app/api/testnet/orders/[id]/route.ts",
    "app/api/testnet/account/snapshot/route.ts",
  ];

  for (const file of ROUTE_FILES) {
    const content = read(file);
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

// ─── No Exchange SDK in liveAdapters ─────────────────────

describe("Phase 5.27 — No Exchange SDK in liveAdapters", () => {
  const ADAPTER_FILES = [
    "lib/liveAdapters/testnetRouteSecurityGuard.ts",
    "lib/liveAdapters/testnetIdempotencyStore.ts",
    "lib/liveAdapters/testnetRateLimitStore.ts",
    "lib/liveAdapters/testnetAuditStore.ts",
    "lib/liveAdapters/testnetEnvConfig.ts",
    "lib/liveAdapters/testnetSecretPolicy.ts",
    "lib/liveAdapters/testnetPermissionCheck.ts",
    "lib/liveAdapters/testnetRequestValidation.ts",
    "lib/liveAdapters/binanceTestnetAdapterSkeleton.ts",
  ];

  for (const file of ADAPTER_FILES) {
    it(`${file} does not import exchange SDK`, () => {
      const content = read(file);
      const importLines = content.split("\n").filter((l) => l.includes("from ") && l.includes("import"));
      for (const line of importLines) {
        expect(line).not.toMatch(/@binance|binance-api|bybit-api|okx-api|ccxt|crypto/i);
      }
    });
  }
});

// ─── Middleware ──────────────────────────────────────────

describe("Phase 5.27 — Middleware Not Modified", () => {
  it("middleware allowlist does not contain /api/testnet", () => {
    const middleware = read("middleware.ts");
    const allowlistMatch = middleware.match(/\/api\/[a-z-]+/g);
    if (allowlistMatch) {
      const testnetRoute = allowlistMatch.find((p) => p.includes("testnet"));
      expect(testnetRoute, "middleware allowlist contains /api/testnet").toBeUndefined();
    }
  });
});

// ─── blockedResponse Never Success True ─────────────────

describe("Phase 5.27 — blockedResponse Never Success True", () => {
  const helper = read("app/api/testnet/_shared/blockedResponse.ts");
  const bodyMatches = helper.match(/success:\s*(true|false)/g) || [];

  it("finds at least one success field in blockedResponse", () => {
    expect(bodyMatches.length).toBeGreaterThan(0);
  });

  for (const m of bodyMatches) {
    it(`success value is 'false' (found: ${m})`, () => {
      expect(m).toBe("success: false");
    });
  }
});

// ─── Docs Assertions ────────────────────────────────────

describe("Phase 5.27 — Docs Assertions", () => {
  const review = read("docs/PHASE_5_FULL_ARCHITECTURE_REVIEW.md");

  it("declares no-real-testnet (❌ 禁止)", () => {
    expect(review).toContain("❌ 禁止");
    expect(review).toContain("真实 testnet 网络请求");
    expect(review).toContain("所有 4 个 route 返回 403");
  });

  it("declares no-secret-access", () => {
    expect(review).toContain("❌ 禁止");
    expect(review).toContain("Secret 访问");
    expect(review).toContain("无 `apiKeyStore` 调用");
  });

  it("declares no-secret-decryption", () => {
    expect(review).toContain("❌ 禁止");
    expect(review).toContain("Secret 解密");
    expect(review).toContain("无 `decryptSecret`");
  });

  it("declares no-signing", () => {
    expect(review).toContain("❌ 禁止");
    expect(review).toContain("签名");
    expect(review).toContain("无 `createHmac`");
  });

  it("declares no-mainnet", () => {
    expect(review).toContain("❌ 禁止");
    expect(review).toContain("主网交易");
    expect(review).toContain("middleware 拦截 mutation");
  });

  it("declares no fetch to exchange", () => {
    expect(review).toContain("❌ 禁止");
    expect(review).toContain("fetch/axios 到交易所");
    expect(review).toContain("无 `fetch(`");
  });

  it("declares no successful testnet route", () => {
    expect(review).toContain("❌ 禁止");
    expect(review).toContain("成功的 testnet route");
    expect(review).toContain("`success:false`");
  });

  it("states readiness=false with 11 blockers", () => {
    expect(review).toContain("11 项");
    expect(review).toContain("Readiness Dashboard");
  });

  it("states Phase 5.28 is review fixes only", () => {
    expect(review).toContain("Phase 5.28");
    expect(review).toContain("Code Review Fixes");
    expect(review).toContain("BLOCKED");
  });
});

// ─── ROADMAP.md Phase 5.28 Blocked ──────────────────────

describe("Phase 5.27 — ROADMAP.md", () => {
  const roadmap = read("docs/ROADMAP.md");

  it("marks Phase 5.27 as completed", () => {
    expect(roadmap).toContain("Phase 5.27");
    expect(roadmap).toContain("✅");
  });

  it("marks Phase 6 as BLOCKED", () => {
    expect(roadmap).toContain("Phase 6");
    expect(roadmap).toContain("BLOCKED");
    expect(roadmap).toContain("等待");
  });
});
