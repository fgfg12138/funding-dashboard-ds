/**
 * Phase 5.15 Testnet Route Skeleton Closure Boundary Tests
 *
 * Verifies Phase 5.9–5.14 closure boundaries:
 * - All 4 route files exist + reference shared helper
 * - No fetch/axios/decryptSecret/HMAC/adapter/apiKeyStore in routes
 * - Shared helper never returns success:true
 * - Middleware not opened for /api/testnet
 * - Stores don't store secrets
 * - Closure doc declares no-real-testnet/no-signing/no-secret-decryption
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

// Collect all route.ts files under app/api/testnet
function collectRouteFiles(): string[] {
  const results: string[] = [];
  function walk(d: string): void {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
        walk(full);
      } else if (entry.isFile() && entry.name === "route.ts") {
        results.push(full);
      }
    }
  }
  walk(join(root, "app/api/testnet"));
  return results;
}

const ROUTE_FILES = collectRouteFiles();

// ─── Route Files Exist ──────────────────────────────────

describe("Closure — Route Files Exist", () => {
  it("has 4 route files (preview-submit, cancel, [id], snapshot)", () => {
    expect(ROUTE_FILES.length).toBe(4);
  });

  for (const f of ROUTE_FILES) {
    const name = f.replace(/\\/g, "/").replace(/.*app\/api\/testnet\//, "");
    it(`${name} exists and imports shared helper`, () => {
      const content = readFileSync(f, "utf8");
      expect(content).toContain("_shared/blockedResponse");
    });
  }
});

// ─── No Forbidden Code in Route Files ───────────────────

describe("Closure — No Forbidden Code in Route Files", () => {
  for (const f of ROUTE_FILES) {
    const name = f.replace(/\\/g, "/").replace(/.*app\/api\/testnet\//, "");
    describe(`${name}`, () => {
      const content = readFileSync(f, "utf8");
      const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      const importLines = content.split("\n").filter((l) => l.includes("import "));

      it("no fetch(", () => {
        expect(noComments).not.toContain("fetch(");
      });

      it("no axios", () => {
        expect(content).not.toContain("axios");
      });

      it("no decryptSecret / importMasterKey", () => {
        expect(content).not.toContain("decryptSecret");
        expect(content).not.toContain("importMasterKey");
      });

      it("no createHmac / HMAC / crypto.subtle.sign", () => {
        expect(content).not.toContain("createHmac");
        expect(content).not.toContain("crypto.subtle.sign");
      });

      it("does not import adapter or apiKeyStore", () => {
        for (const line of importLines) {
          expect(line).not.toMatch(/adapter|apiKeyStore|decrypt/i);
        }
      });
    });
  }
});

// ─── Shared Helper Never Returns success:true ───────────

describe("Closure — Shared Helper Never Success True", () => {
  const helper = read("app/api/testnet/_shared/blockedResponse.ts");

  it("success is always false in response bodies", () => {
    const bodyMatches = helper.match(/success:\s*(true|false)/g);
    if (bodyMatches) {
      for (const m of bodyMatches) {
        expect(m).toBe("success: false");
      }
    }
  });

  it("returns 403 status", () => {
    const count403 = (helper.match(/status:\s*403/g) || []).length;
    expect(count403).toBeGreaterThanOrEqual(3);
  });
});

// ─── Middleware ──────────────────────────────────────────

describe("Closure — Middleware Not Modified", () => {
  it("middleware allowlist does not contain /api/testnet", () => {
    const middleware = read("middleware.ts");
    const allowlistMatch = middleware.match(/\/api\/[a-z-]+/g);
    if (allowlistMatch) {
      const testnetRoute = allowlistMatch.find((p) => p.includes("testnet"));
      expect(testnetRoute, "middleware allowlist contains /api/testnet").toBeUndefined();
    }
  });
});

// ─── Stores Don't Store Secrets ─────────────────────────

describe("Closure — Stores Don't Store Secrets", () => {
  const storeFiles = [
    "lib/liveAdapters/testnetIdempotencyStore.ts",
    "lib/liveAdapters/testnetRateLimitStore.ts",
    "lib/liveAdapters/testnetAuditStore.ts",
  ];

  for (const file of storeFiles) {
    it(`${file} does not store secret/decrypt/apiKey`, () => {
      const content = read(file);
      const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(noComments).not.toContain("apiSecret");
      expect(noComments).not.toContain("decrypt");
    });
  }
});

// ─── No Real Exchange SDK ───────────────────────────────

describe("Closure — No Exchange SDK", () => {
  const allLibFiles: string[] = [];
  function walk(d: string): void {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
        walk(full);
      } else if (entry.isFile() && /\.ts$/.test(entry.name)) {
        allLibFiles.push(full);
      }
    }
  }
  walk(join(root, "lib/liveAdapters"));

  for (const f of allLibFiles) {
    const name = f.replace(/\\/g, "/");
    // Skip test files and the types file
    if (name.includes(".test.")) continue;
    it(`${name} does not import exchange SDK`, () => {
      const content = readFileSync(f, "utf8");
      const importLines = content.split("\n").filter((l) => l.includes("import ") && l.includes("from"));
      for (const line of importLines) {
        expect(line).not.toMatch(/@binance|binance-api|bybit-api|okx-api|ccxt/i);
      }
    });
  }
});

// ─── Docs Assertions ────────────────────────────────────

describe("Closure — Docs Assertions", () => {
  const closure = read("docs/PHASE_5_TESTNET_ROUTE_SKELETON_CLOSURE.md");

  it("declares no-real-testnet", () => {
    expect(closure).toContain("No-Real-Testnet");
    expect(closure).toContain("所有 route 返回 403");
  });

  it("declares no-signing", () => {
    expect(closure).toContain("No-Signing");
    expect(closure).toContain("无 `createHmac`");
  });

  it("declares no-secret-decryption", () => {
    expect(closure).toContain("No-Secret-Decryption");
    expect(closure).toContain("无 `decryptSecret`");
  });

  it("declares no-middleware-whitelist", () => {
    expect(closure).toContain("No-Middleware-Whitelist");
    expect(closure).toContain("不在 allowlist");
  });

  it("states routes are still blocked", () => {
    expect(closure).toContain("403 blocked");
    expect(closure).toContain("success: false");
  });

  it("lists Phase 5.9–5.14 completed modules", () => {
    expect(closure).toContain("5.9");
    expect(closure).toContain("5.10");
    expect(closure).toContain("5.11");
    expect(closure).toContain("5.12");
    expect(closure).toContain("5.13");
    expect(closure).toContain("5.14");
  });

  it("lists real testnet prerequisites", () => {
    expect(closure).toContain("前置条件");
    expect(closure).toContain("代码审查");
    expect(closure).toContain("Kill Switch");
  });

  it("warns against mainnet", () => {
    expect(closure).toContain("绝不能直接接主网");
  });
});
