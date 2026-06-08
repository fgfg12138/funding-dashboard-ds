/**
 * Phase 5.9 Testnet Route Handler Skeleton Boundary Tests
 *
 * Verifies:
 * - All 4 route files exist
 * - Each returns 403 blocked (no real interactions)
 * - No fetch/axios/HMAC/decryptSecret/SDK in route files
 * - middleware not opened for /api/testnet
 * - No real network requests, no real trading
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const ROUTES = [
  "app/api/testnet/orders/preview-submit/route.ts",
  "app/api/testnet/orders/cancel/route.ts",
  "app/api/testnet/orders/[id]/route.ts",
  "app/api/testnet/account/snapshot/route.ts",
] as const;

// ─── Route Files Exist ──────────────────────────────────

describe("Phase 5.9 — Route Files Exist", () => {
  for (const route of ROUTES) {
    it(`${route} exists`, () => {
      expect(existsSync(join(root, route))).toBe(true);
    });
  }
});

// ─── Route Returns Blocked ──────────────────────────────

describe("Phase 5.9 — Route Responses Are Blocked", () => {
  for (const route of ROUTES) {
    it(`${route} contains blocked/disabled response`, () => {
      const content = read(route);
      expect(content).toContain("403");
      expect(content).toContain("skeleton only");
    });
  }
});

// ─── Static Analysis — No Forbidden Code ────────────────

describe("Phase 5.9 — Static Analysis (No Forbidden Code)", () => {
  for (const route of ROUTES) {
    describe(`${route}`, () => {
      const content = read(route);
      const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

      it("does not contain fetch(", () => {
        expect(noComments).not.toContain("fetch(");
      });

      it("does not contain axios", () => {
        expect(noComments).not.toContain("axios");
      });

      it("does not contain createHmac / HMAC / crypto.subtle.sign", () => {
        expect(noComments).not.toContain("createHmac");
        expect(noComments).not.toContain("crypto.subtle.sign");
      });

      it("does not contain decryptSecret / importMasterKey", () => {
        expect(content).not.toContain("decryptSecret");
        expect(content).not.toContain("importMasterKey");
      });

      it("does not import exchange SDK or crypto modules", () => {
        const importLines = content.split("\n").filter((l) => l.includes("import "));
        for (const line of importLines) {
          expect(line).not.toMatch(/binance|bybit|okx|crypto|node-fetch|cross-fetch|axios/);
        }
      });
    });
  }
});

// ─── Middleware ──────────────────────────────────────────

describe("Phase 5.9 — Middleware Not Modified", () => {
  it("middleware has not opened /api/testnet route", () => {
    const middleware = read("middleware.ts");
    const allowlistMatch = middleware.match(/\/api\/[a-z-]+/g);
    if (allowlistMatch) {
      const testnetRoute = allowlistMatch.find((p) => p.includes("testnet"));
      expect(testnetRoute, "middleware allowlist contains /api/testnet").toBeUndefined();
    }
  });
});

// ─── Docs ────────────────────────────────────────────────

describe("Phase 5.9 — Docs Assertions", () => {
  it("TESTNET_SERVER_ROUTE_DESIGN.md mentions Phase 5.9 skeleton", () => {
    const content = read("docs/TESTNET_SERVER_ROUTE_DESIGN.md");
    expect(content).toContain("Phase 5.9");
    expect(content).toContain("Skeleton");
  });
});
