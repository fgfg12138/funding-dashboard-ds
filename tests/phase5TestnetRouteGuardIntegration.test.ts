/**
 * Phase 5.11 Testnet Route Guard Integration Tests
 *
 * Verifies:
 * - All 4 routes import from the shared helper
 * - Shared helper calls evaluateTestnetRouteSecurityGuard
 * - All routes return blocked/disabled only
 * - No fetch/axios/HMAC/decryptSecret in route files or shared helper
 * - No adapter or apiKeyStore imports in app/api/testnet
 * - middleware unchanged
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

function collectDirFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(d: string): void {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) {
        walk(full);
      } else if (entry.isFile() && entry.name === "route.ts") {
        results.push(full);
      }
    }
  }
  walk(join(root, dir));
  return results;
}

const ROUTE_FILES = collectDirFiles("app/api/testnet");
const ROUTE_NAMES = ROUTE_FILES.map((f) => f.replace(/\\/g, "/").replace(/.*app\/api\/testnet\//, ""));

const SHARED_HELPER = "app/api/testnet/_shared/blockedResponse.ts";

// ─── Route Files Import Shared Helper ───────────────────

describe("Phase 5.11 — Route Files Import Shared Helper", () => {
  for (const routeFile of ROUTE_FILES) {
    const relative = routeFile.replace(/\\/g, "/").replace(/.*app\/api\/testnet\//, "");
    // Skip the shared helper itself
    if (relative.includes("_shared")) continue;

    it(`${relative} imports from _shared/blockedResponse`, () => {
      const content = readFileSync(routeFile, "utf8");
      expect(content).toContain("_shared/blockedResponse");
    });
  }
});

// ─── Shared Helper Interface ────────────────────────────

describe("Phase 5.11 — Shared Helper", () => {
  const content = read(SHARED_HELPER);

  it("exports buildBlockedTestnetResponse", () => {
    expect(content).toContain("buildBlockedTestnetResponse");
  });

  it("exports buildDefaultSkeletonChecklist", () => {
    expect(content).toContain("buildDefaultSkeletonChecklist");
  });

  it("exports buildGuardedBlockedResponse", () => {
    expect(content).toContain("buildGuardedBlockedResponse");
  });

  it("calls evaluateTestnetRouteSecurityGuard", () => {
    expect(content).toContain("evaluateTestnetRouteSecurityGuard");
  });

  it("returns 403 status", () => {
    expect(content).toContain("403");
  });

  it("contains skeleton-only message", () => {
    expect(content).toContain("no network request, no order placement");
  });
});

// ─── No Forbidden Code in Route Files ───────────────────

describe("Phase 5.11 — No Forbidden Code in Route Files", () => {
  for (const routeFile of ROUTE_FILES) {
    const relative = routeFile.replace(/\\/g, "/").replace(/.*app\/api\/testnet\//, "");
    if (relative.includes("_shared")) continue;

    describe(`${relative}`, () => {
      const content = readFileSync(routeFile, "utf8");
      const importLines = content.split("\n").filter((l) => l.includes("import "));

      it("does not contain fetch(", () => {
        const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        expect(noComments).not.toContain("fetch(");
      });

      it("does not contain axios", () => {
        expect(content).not.toContain("axios");
      });

      it("does not contain createHmac / HMAC / crypto.subtle.sign", () => {
        expect(content).not.toContain("createHmac");
        expect(content).not.toContain("crypto.subtle.sign");
      });

      it("does not contain decryptSecret / importMasterKey", () => {
        expect(content).not.toContain("decryptSecret");
        expect(content).not.toContain("importMasterKey");
      });

      it("does not import adapter or apiKeyStore", () => {
        for (const line of importLines) {
          expect(line).not.toMatch(/adapter|apiKeyStore|decrypt/i);
        }
      });
    });
  }
});

// ─── No Forbidden Code in Shared Helper ─────────────────

describe("Phase 5.11 — No Forbidden Code in Shared Helper", () => {
  const content = read(SHARED_HELPER);
  const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("does not contain fetch(", () => {
    expect(noComments).not.toContain("fetch(");
  });

  it("does not contain axios", () => {
    expect(content).not.toContain("axios");
  });

  it("does not contain createHmac / crypto.subtle.sign", () => {
    expect(content).not.toContain("createHmac");
    expect(content).not.toContain("crypto.subtle.sign");
  });

  it("does not contain decryptSecret / importMasterKey", () => {
    expect(content).not.toContain("decryptSecret");
    expect(content).not.toContain("importMasterKey");
  });
});

// ─── All Routes Still Blocked ───────────────────────────

describe("Phase 5.11 — All Routes Return Blocked", () => {
  for (const routeFile of ROUTE_FILES) {
    const relative = routeFile.replace(/\\/g, "/").replace(/.*app\/api\/testnet\//, "");
    if (relative.includes("_shared")) continue;

    it(`${relative} does not return success:true`, () => {
      const content = readFileSync(routeFile, "utf8");
      const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      // The file should not try to set success: true
      expect(noComments).not.toContain("success: true");
    });
  }
});

// ─── Middleware ──────────────────────────────────────────

describe("Phase 5.11 — Middleware Not Modified", () => {
  it("middleware has not opened /api/testnet route", () => {
    const middleware = read("middleware.ts");
    const allowlistMatch = middleware.match(/\/api\/[a-z-]+/g);
    if (allowlistMatch) {
      const testnetRoute = allowlistMatch.find((p) => p.includes("testnet"));
      expect(testnetRoute, "middleware allowlist contains /api/testnet").toBeUndefined();
    }
  });
});
