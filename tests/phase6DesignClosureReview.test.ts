/**
 * Phase 6.6 Design Closure Review Tests
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPhase6ReadinessReview } from "@/lib/liveAdapters/phase6ReadinessReview";

const root = process.cwd();
function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const DESIGN_FILES = [
  "docs/PERSISTENT_AUDIT_STORAGE_DESIGN.md",
  "docs/SERVER_SECRET_VAULT_DESIGN.md",
  "docs/REAL_PERMISSION_VERIFICATION_DESIGN.md",
  "docs/SIGNING_ARCHITECTURE_DESIGN.md",
  "docs/TESTNET_ROLLBACK_PLAN_DESIGN.md",
];

const POLICY_FILES = [
  "lib/audit/persistentAuditSchema.ts",
  "lib/audit/persistentAuditTypes.ts",
  "lib/liveAdapters/secretVaultPolicy.ts",
  "lib/liveAdapters/secretVaultTypes.ts",
  "lib/liveAdapters/realPermissionVerificationPolicy.ts",
  "lib/liveAdapters/realPermissionVerificationTypes.ts",
  "lib/liveAdapters/signingPolicy.ts",
  "lib/liveAdapters/signingArchitectureTypes.ts",
  "lib/liveAdapters/testnetRollbackPolicy.ts",
  "lib/liveAdapters/testnetRollbackTypes.ts",
];

// ─── Closure Doc Exists ─────────────────────────────────

describe("Phase 6.6 — Closure Doc Exists", () => {
  const doc = read("docs/PHASE_6_DESIGN_CLOSURE_REVIEW.md");
  it("exists and has content", () => {
    expect(doc.length).toBeGreaterThan(0);
  });
});

// ─── Closure Doc Content ────────────────────────────────

describe("Phase 6.6 — Closure Doc Content", () => {
  const doc = read("docs/PHASE_6_DESIGN_CLOSURE_REVIEW.md");

  it("declares readiness=false", () => {
    expect(doc).toContain("NOT READY");
    expect(doc).toContain("ready=false");
  });

  it("declares no-real-testnet", () => {
    expect(doc).toContain("真实 testnet 网络请求");
    expect(doc).toContain("❌ 禁止");
  });

  it("declares no-signing", () => {
    expect(doc).toContain("签名");
    expect(doc).toContain("❌ 禁止");
  });

  it("declares no-secret-decryption", () => {
    expect(doc).toContain("Secret 解密");
    expect(doc).toContain("❌ 禁止");
  });

  it("mentions 7 unimplemented items", () => {
    expect(doc).toContain("7 个");
    expect(doc).toContain("未开始");
  });

  it("lists all 5 design phases", () => {
    expect(doc).toContain("6.1");
    expect(doc).toContain("6.2");
    expect(doc).toContain("6.3");
    expect(doc).toContain("6.4");
    expect(doc).toContain("6.5");
  });

  it("states Phase 6.7 is review fixes only", () => {
    expect(doc).toContain("Phase 6.7");
    expect(doc).toContain("code review fixes");
  });
});

// ─── All Design Docs Exist ──────────────────────────────

describe("Phase 6.6 — All Design Docs Exist", () => {
  for (const f of DESIGN_FILES) {
    it(`${f} exists`, () => {
      expect(read(f).length).toBeGreaterThan(0);
    });
  }
});

// ─── No Forbidden Code in Policy Files ──────────────────

describe("Phase 6.6 — No Forbidden Code in Policy Files", () => {
  for (const f of POLICY_FILES) {
    const content = read(f);
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const name = f.replace(/.*\//, "");

    it(`${name} no fetch(`, () => expect(noComments).not.toContain("fetch("));
    it(`${name} no axios`, () => expect(content).not.toContain("axios"));
    it(`${name} no decryptSecret`, () => expect(content).not.toContain("decryptSecret"));
    it(`${name} no importMasterKey`, () => expect(content).not.toContain("importMasterKey"));
    it(`${name} no apiKeyStore`, () => expect(content).not.toContain("apiKeyStore"));
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

// ─── Route Files Still Blocked ──────────────────────────

describe("Phase 6.6 — Route Files Still Blocked", () => {
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
    it(`${f} imports shared helper`, () => expect(content).toContain("blockedResponse"));
  }
});

// ─── Middleware ──────────────────────────────────────────

describe("Phase 6.6 — Middleware Not Modified", () => {
  it("/api/testnet not in allowlist", () => {
    const mw = read("middleware.ts");
    const paths = mw.match(/\/api\/[a-z-]+/g) || [];
    expect(paths.find((p) => p.includes("testnet"))).toBeUndefined();
  });
});

// ─── Readiness ──────────────────────────────────────────

describe("Phase 6.6 — Readiness Still False", () => {
  const review = buildPhase6ReadinessReview();
  it("ready is false", () => expect(review.ready).toBe(false));
  it("requiredBlocked > 0", () => expect(review.requiredBlocked).toBeGreaterThan(0));
});
