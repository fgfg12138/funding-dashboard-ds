/**
 * Phase 5.30 Release Candidate Freeze Tests
 *
 * Verifies the RC freeze state:
 * - RC doc exists with required content
 * - package.json version includes rc
 * - readiness is false
 * - routes still blocked
 * - middleware not opened
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReadinessSummary } from "@/lib/liveAdapters/testnetReadinessSummary";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

// ─── RC Doc Exists ───────────────────────────────────────

describe("Phase 5.30 RC — Document Exists", () => {
  const doc = read("docs/PHASE_5_RELEASE_CANDIDATE.md");
  it("exists and has content", () => {
    expect(doc.length).toBeGreaterThan(0);
  });
});

// ─── RC Doc Content ─────────────────────────────────────

describe("Phase 5.30 RC — Document Content", () => {
  const doc = read("docs/PHASE_5_RELEASE_CANDIDATE.md");

  it("declares RC version", () => {
    expect(doc).toContain("0.5.0-rc.1");
  });

  it("declares no-real-testnet", () => {
    expect(doc).toContain("真实 testnet 网络请求");
    expect(doc).toContain("❌ 不包含");
  });

  it("declares no-mainnet", () => {
    expect(doc).toContain("主网交易");
    expect(doc).toContain("❌ 不包含");
  });

  it("declares no-signing", () => {
    expect(doc).toContain("API Key 签名");
    expect(doc).toContain("❌ 不包含");
  });

  it("declares no-secret-retrieval", () => {
    expect(doc).toContain("Secret 解密");
    expect(doc).toContain("❌ 不包含");
  });

  it("declares 89 test files and 1702 tests", () => {
    expect(doc).toContain("89");
    expect(doc).toContain("1,702");
  });

  it("declares routes all return 403", () => {
    expect(doc).toContain("403");
  });

  it("declares readiness = NOT READY", () => {
    expect(doc).toContain("NOT READY");
    expect(doc).toContain("11");
  });

  it("declares rollback instructions", () => {
    expect(doc).toContain("git revert");
  });

  it("declares Phase 6 is BLOCKED", () => {
    expect(doc).toContain("BLOCKED");
    expect(doc).toContain("Phase 6");
  });

  it("contains mainnet warning", () => {
    expect(doc).toContain("主网警告");
  });
});

// ─── package.json Version ────────────────────────────────

describe("Phase 5.30 RC — package.json Version", () => {
  const pkg = JSON.parse(read("package.json"));

  it("version includes rc", () => {
    expect(pkg.version).toContain("rc");
  });

  it("version is 0.5.0-rc.1", () => {
    expect(pkg.version).toBe("0.5.0-rc.1");
  });
});

// ─── Readiness ──────────────────────────────────────────

describe("Phase 5.30 RC — Readiness", () => {
  const summary = buildReadinessSummary();
  it("ready is false", () => {
    expect(summary.ready).toBe(false);
  });
  it("has required blockers", () => {
    expect(summary.requiredBlocked).toBeGreaterThan(0);
  });
});

// ─── Routes Still Blocked ───────────────────────────────

describe("Phase 5.30 RC — Routes Still Blocked", () => {
  const ROUTES = [
    "app/api/testnet/orders/preview-submit/route.ts",
    "app/api/testnet/orders/cancel/route.ts",
    "app/api/testnet/orders/[id]/route.ts",
    "app/api/testnet/account/snapshot/route.ts",
  ];

  for (const f of ROUTES) {
    it(`${f} uses shared helper and has no success: true`, () => {
      const content = read(f);
      const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(noComments).not.toContain("success: true");
      expect(content).toContain("blockedResponse");
    });
  }
});

// ─── Middleware ──────────────────────────────────────────

describe("Phase 5.30 RC — Middleware Not Modified", () => {
  it("/api/testnet not in allowlist", () => {
    const middleware = read("middleware.ts");
    const paths = middleware.match(/\/api\/[a-z-]+/g) || [];
    expect(paths.find((p) => p.includes("testnet"))).toBeUndefined();
  });
});
