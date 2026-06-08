/**
 * Phase 5.24 Runtime Smoke Closure Boundary Tests
 *
 * Verifies Phase 5.23 runtime smoke closure:
 * - Closure doc exists and declares all boundaries
 * - Runtime smoke test file has no forbidden code
 * - Route files still have no forbidden code
 * - Middleware unchanged
 * - blockedResponse never returns success:true
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const ROUTE_FILES = [
  "app/api/testnet/orders/preview-submit/route.ts",
  "app/api/testnet/orders/cancel/route.ts",
  "app/api/testnet/orders/[id]/route.ts",
  "app/api/testnet/account/snapshot/route.ts",
];

const SMOKE_TEST_FILE = "tests/phase5TestnetRouteRuntimeSmoke.test.ts";
const CLOSURE_DOC = "docs/PHASE_5_RUNTIME_SMOKE_CLOSURE.md";

// ─── Closure Doc Exists ─────────────────────────────────

describe("Phase 5.24 — Closure Doc Exists", () => {
  it("PHASE_5_RUNTIME_SMOKE_CLOSURE.md exists", () => {
    const content = read(CLOSURE_DOC);
    expect(content.length).toBeGreaterThan(0);
  });
});

// ─── Closure Doc Content ────────────────────────────────

describe("Phase 5.24 — Closure Doc Content", () => {
  const doc = read(CLOSURE_DOC);

  it("declares 4 routes smoke tested", () => {
    expect(doc).toContain("preview-submit");
    expect(doc).toContain("cancel");
    expect(doc).toContain("[id]");
    expect(doc).toContain("snapshot");
  });

  it("declares all scenarios return 403", () => {
    expect(doc).toContain("403 blocked");
    const scenarioCount = (doc.match(/\| 403 \| ✅/g) || []).length;
    expect(scenarioCount).toBeGreaterThanOrEqual(4);
  });

  it("declares no-real-testnet", () => {
    expect(doc).toContain("No-Real-Testnet");
    expect(doc).toContain("所有 route 返回 403");
  });

  it("declares no-secret", () => {
    expect(doc).toContain("No-Secret");
    expect(doc).toContain("无 `decryptSecret`");
  });

  it("declares no-signing", () => {
    expect(doc).toContain("No-Signing");
    expect(doc).toContain("无 `createHmac`");
  });

  it("declares no-fetch", () => {
    expect(doc).toContain("No-Fetch");
    expect(doc).toContain("无 `fetch(`");
  });

  it("declares no-middleware-change", () => {
    expect(doc).toContain("No-Middleware-Change");
    expect(doc).toContain("未加入 middleware mutation allowlist");
  });

  it("declares no-success-true", () => {
    expect(doc).toContain("No-Success-True");
    expect(doc).toContain("`success:` 均为 `false`");
  });

  it("states Phase 5.25 is readiness checklist only", () => {
    expect(doc).toContain("Phase 5.25");
    expect(doc).toContain("Readiness Checklist");
  });
});

// ─── No Forbidden Code in Smoke Test File ───────────────

describe("Phase 5.24 — No Forbidden Code in Smoke Test", () => {
  const content = read(SMOKE_TEST_FILE);
  const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("does not contain fetch(", () => {
    expect(noComments).not.toContain("fetch(");
  });

  it("does not contain axios", () => {
    expect(content).not.toContain("axios");
  });

  it("does not contain decryptSecret / importMasterKey", () => {
    expect(content).not.toContain("decryptSecret");
    expect(content).not.toContain("importMasterKey");
  });

  it("does not contain createHmac / crypto.subtle.sign", () => {
    expect(content).not.toContain("createHmac");
    expect(content).not.toContain("crypto.subtle.sign");
  });
});

// ─── No Forbidden Code in Route Files ───────────────────

describe("Phase 5.24 — No Forbidden Code in Route Files", () => {
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

// ─── Middleware ──────────────────────────────────────────

describe("Phase 5.24 — Middleware Not Modified", () => {
  it("middleware allowlist does not contain /api/testnet", () => {
    const middleware = read("middleware.ts");
    const allowlistMatch = middleware.match(/\/api\/[a-z-]+/g);
    if (allowlistMatch) {
      const testnetRoute = allowlistMatch.find((p) => p.includes("testnet"));
      expect(testnetRoute, "middleware allowlist contains /api/testnet").toBeUndefined();
    }
  });
});

// ─── blockedResponse Never Returns success:true ─────────

describe("Phase 5.24 — blockedResponse Never Success True", () => {
  const helper = read("app/api/testnet/_shared/blockedResponse.ts");
  const bodyMatches = helper.match(/success:\s*(true|false)/g);

  if (bodyMatches) {
    for (const m of bodyMatches) {
      it(`success value is 'false' (found: ${m})`, () => {
        expect(m).toBe("success: false");
      });
    }
  }
});
