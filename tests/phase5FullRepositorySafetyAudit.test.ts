/**
 * Phase 5.29 Full Repository Safety Audit Tests
 *
 * Scans the entire codebase for safety violations.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReadinessSummary } from "@/lib/liveAdapters/testnetReadinessSummary";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function collectFiles(dir: string, pred: (name: string) => boolean): string[] {
  const res: string[] = [];
  function walk(d: string): void {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name);
      if (e.isDirectory() && e.name !== "node_modules" && !e.name.startsWith(".")) walk(f);
      else if (e.isFile() && pred(e.name)) res.push(f);
    }
  }
  walk(join(root, dir));
  return res;
}

const pathSep = "\\\\"; // or "/" after normalization

// ─── 1. No Real Order Placement ─────────────────────────

describe("Safety — No Real Order Placement", () => {
  const runFiles = [
    ...collectFiles("app", (n) => /\.(ts|tsx)$/.test(n) && !n.includes(".test.")),
    ...collectFiles("lib", (n) => /\.(ts|tsx)$/.test(n) && !n.includes(".test.")),
  ];

  it("no file contains submitLiveOrder or placeLiveOrder", () => {
    for (const f of runFiles) {
      const code = stripComments(readFileSync(f, "utf8"));
      expect(code, `Found in ${f}`).not.toMatch(/submitLiveOrder|placeLiveOrder/);
    }
  });

  it("testnet routes never return success: true", () => {
    const routes = collectFiles("app/api/testnet", (n) => n === "route.ts" && !n.includes("_shared"));
    for (const f of routes) {
      const code = stripComments(readFileSync(f, "utf8"));
      expect(code, `Found success: true in ${f}`).not.toContain("success: true");
    }
  });

  it("blockedResponse never returns success: true", () => {
    const helper = read("app/api/testnet/_shared/blockedResponse.ts");
    const matches = helper.match(/success:\s*(true|false)/g) || [];
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) expect(m).toBe("success: false");
  });
});

// ─── 2. No fetch/axios in liveAdapters + testnet routes ─

describe("Safety — No fetch/axios in liveAdapters + testnet routes", () => {
  const adapterFiles = collectFiles("lib/liveAdapters", (n) => /\.ts$/.test(n) && !n.includes(".test."));
  const routeFiles = collectFiles("app/api/testnet", (n) => n === "route.ts");

  for (const f of [...adapterFiles, ...routeFiles]) {
    const name = f.replace(/\\/g, "/").replace(/.*(liveAdapters|testnet)\//, "");
    const code = stripComments(readFileSync(f, "utf8"));

    it(`${name} no fetch(`, () => expect(code, `fetch( in ${name}`).not.toContain("fetch("));
    it(`${name} no axios`, () => expect(code, `axios in ${name}`).not.toContain("axios"));
  }
});

// ─── 3. No Secret Decryption or Signing ─────────────────

describe("Safety — No Secret Decryption or Signing", () => {
  const skipFiles = ["apiKeys/crypto", "security/apiKeyCrypto", "security/index", "BinanceSigning", "types.ts", "Types.ts"];

  const allRun = [
    ...collectFiles("app", (n) => /\.(ts|tsx)$/.test(n) && !n.includes(".test.")),
    ...collectFiles("lib", (n) => /\.(ts|tsx)$/.test(n) && !n.includes(".test.")),
  ];

  for (const f of allRun) {
    const name = f.replace(/\\/g, "/").replace(/.*(app|lib)\//, "");
    if (skipFiles.some((s) => name.includes(s))) continue;

    const code = stripComments(readFileSync(f, "utf8"));

    it(`${name} no decryptSecret`, () => expect(code, `decryptSecret in ${name}`).not.toContain("decryptSecret"));
    it(`${name} no importMasterKey`, () => expect(code, `importMasterKey in ${name}`).not.toContain("importMasterKey"));
    it(`${name} no createHmac`, () => expect(code, `createHmac in ${name}`).not.toContain("createHmac"));
    it(`${name} no crypto.subtle.sign`, () => expect(code, `crypto.subtle.sign in ${name}`).not.toContain("crypto.subtle.sign"));
  }
});

// ─── 4. Middleware ────────────────────────────────────────

describe("Safety — Middleware", () => {
  it("/api/testnet NOT in allowlist", () => {
    const mw = read("middleware.ts");
    const paths = mw.match(/\/api\/[a-z-]+/g) || [];
    expect(paths.find((p) => p.includes("testnet"))).toBeUndefined();
  });

  it("blocks non-GET with 405", () => {
    const mw = read("middleware.ts");
    expect(mw).toContain("status: 405");
    expect(mw).toContain("READ_ONLY_MODE");
  });
});

// ─── 5. No Mainnet ────────────────────────────────────────

describe("Safety — No Mainnet Capability", () => {
  const allFiles = [
    ...collectFiles("app", (n) => /\.(ts|tsx)$/.test(n) && !n.includes(".test.")),
    ...collectFiles("lib", (n) => /\.(ts|tsx)$/.test(n) && !n.includes(".test.")),
    ...collectFiles("components", (n) => /\.(ts|tsx)$/.test(n) && !n.includes(".test.")),
  ];

  // Known files that reference mainnet in type fields or safety checks
  const known = ["testnetEnvConfig", "testnetEnvTypes", "testnetAdapterTypes",
    "testnetRouteTypes", "testnetRouteSecurityGuard", "sandboxSafetyGate",
    "blockedResponse", "executionQueueTypes", "testnetSecretPolicy",
    "binanceTestnetAdapterSkeleton", "goNoGoReview", "noGoRemediation",
    "ReadOnly", "mainnet24hShadowTypes", "mainnetReadOnlyShadowTypes",
    "mainnet7DayReadOnlyShadowTypes",
    "tinyDryRunTypes",
    "DryRun",
    "FilledOrder",
    // index.ts exports MainnetShadowReport / Mainnet24hShadowReport in type re-exports
    "liveAuto/index.ts"];

  // Check all files for mainnet in run code (not comments)
  for (const f of allFiles) {
    const name = f.replace(/\\/g, "/").replace(/.*\/(app|lib|components)\//, "");
    if (known.some((k) => name.includes(k))) continue;
    const code = stripComments(readFileSync(f, "utf8"));
    if (code.toLowerCase().includes("mainnet")) {
      it(`${name} no mainnet reference in run code`, () => {
        expect(code, `mainnet in ${name}`).not.toMatch(/mainnet/i);
      });
    }
  }

  // Always generate at least one test so the suite doesn't fail
  it("no mainnet adapter files exist", () => {
    const libFiles = collectFiles("lib", (n) => /\.(ts|tsx)$/.test(n) && !n.includes(".test."));
    for (const f of libFiles) {
      const name = f.replace(/\\/g, "/");
      if (name.includes("ReadOnly") || name.includes("24hShadow") || name.includes("7DayShadow") || name.includes("DryRun") || name.includes("FilledOrder")) continue;
      expect(name, `mainnet file found: ${name}`).not.toMatch(/mainnet/i);
    }
  });
});

// ─── 6. API Key Page ─────────────────────────────────────

describe("Safety — API Key Page", () => {
  it("inputs are disabled", () => {
    expect(read("app/api-keys/page.tsx")).toContain("disabled");
  });

  it("no POST endpoint to save keys", () => {
    let dirs: string[] = [];
    try { dirs = readdirSync(join(root, "app", "api")).filter((e) => !e.startsWith(".")); } catch { /* ok */ }
    expect(dirs.includes("keys")).toBe(false);
    expect(dirs.includes("api-keys")).toBe(false);
  });
});

// ─── 7. Readiness ────────────────────────────────────────

describe("Safety — Readiness", () => {
  const s = buildReadinessSummary();
  it("ready=false", () => expect(s.ready).toBe(false));
  it("requiredBlocked>0", () => expect(s.requiredBlocked).toBeGreaterThan(0));
});

// ─── 8. Docs ─────────────────────────────────────────────

describe("Safety — Docs Audit", () => {
  const doc = read("docs/PHASE_5_FULL_REPOSITORY_SAFETY_AUDIT.md");
  it("declares no-mainnet", () => expect(doc).toContain("无 mainnet"));
  it("declares no-real-testnet", () => expect(doc).toContain("所有 testnet route 返回 403"));
  it("declares no-secret-decryption", () => expect(doc).toContain("decryptSecret"));
  it("declares no-signing", () => expect(doc).toContain("createHmac"));
});
