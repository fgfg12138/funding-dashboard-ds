/**
 * Phase 5.21 Testnet Preflight Skeleton Closure Boundary Tests
 *
 * Verifies Phase 5.16–5.20 preflight skeleton closure:
 * - blockedResponse contains all preflight fields
 * - No forbidden code in routes or liveAdapters
 * - Middleware unchanged
 * - Closure doc declares all boundaries
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

function collectDirFiles(dir: string, predicate: (name: string) => boolean): string[] {
  const results: string[] = [];
  function walk(d: string): void {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) {
        walk(full);
      } else if (entry.isFile() && predicate(entry.name)) {
        results.push(full);
      }
    }
  }
  walk(join(root, dir));
  return results;
}

// ─── blockedResponse Contains All Preflight Fields ───────

describe("Phase 5.21 — blockedResponse preflight fields", () => {
  const helper = read("app/api/testnet/_shared/blockedResponse.ts");

  it("contains env field", () => {
    expect(helper).toContain("env: envMeta");
  });

  it("contains guard field", () => {
    expect(helper).toContain("guard:");
  });

  it("contains secretPolicy field", () => {
    expect(helper).toContain("secretPolicy:");
  });

  it("contains permission field", () => {
    expect(helper).toContain("permission:");
  });

  it("contains validation field", () => {
    expect(helper).toContain("validation:");
  });

  it("contains idempotency field", () => {
    expect(helper).toContain("idempotency:");
  });

  it("contains rateLimit field", () => {
    expect(helper).toContain("rateLimit:");
  });

  it("contains audit field", () => {
    expect(helper).toContain("audit:");
  });

  it("never returns success: true", () => {
    const bodyMatches = helper.match(/success:\s*(true|false)/g);
    if (bodyMatches) {
      for (const m of bodyMatches) {
        expect(m).toBe("success: false");
      }
    }
  });
});

// ─── No Forbidden Code in Route Files ────────────────────

describe("Phase 5.21 — No Forbidden Code in Route Files", () => {
  const routes = collectDirFiles("app/api/testnet", (name) => name === "route.ts");

  for (const f of routes) {
    const name = f.replace(/\\/g, "/").replace(/.*app\/api\/testnet\//, "");
    if (name.includes("_shared")) continue;

    const content = readFileSync(f, "utf8");
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    it(`${name} does not contain fetch(`, () => {
      expect(noComments).not.toContain("fetch(");
    });

    it(`${name} does not contain axios`, () => {
      expect(content).not.toContain("axios");
    });

    it(`${name} does not contain decryptSecret / importMasterKey`, () => {
      expect(content).not.toContain("decryptSecret");
      expect(content).not.toContain("importMasterKey");
    });

    it(`${name} does not contain createHmac / HMAC / crypto.subtle.sign`, () => {
      expect(content).not.toContain("createHmac");
      expect(content).not.toContain("crypto.subtle.sign");
    });
  }
});

// ─── No Forbidden Code in liveAdapters Preflight Files ───

describe("Phase 5.21 — No Forbidden Code in Preflight Files", () => {
  const preflightFiles = [
    "lib/liveAdapters/testnetEnvTypes.ts",
    "lib/liveAdapters/testnetEnvConfig.ts",
    "lib/liveAdapters/testnetSecretPolicyTypes.ts",
    "lib/liveAdapters/testnetSecretPolicy.ts",
    "lib/liveAdapters/testnetPermissionTypes.ts",
    "lib/liveAdapters/testnetPermissionCheck.ts",
    "lib/liveAdapters/testnetRequestValidationTypes.ts",
    "lib/liveAdapters/testnetRequestValidation.ts",
  ];

  for (const file of preflightFiles) {
    const shortName = file.replace("lib/liveAdapters/", "");
    it(`${shortName} does not contain fetch(`, () => {
      const content = read(file);
      const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(noComments).not.toContain("fetch(");
    });

    it(`${shortName} does not contain axios`, () => {
      expect(read(file)).not.toContain("axios");
    });

    it(`${shortName} does not contain decryptSecret / importMasterKey`, () => {
      const content = read(file);
      expect(content).not.toContain("decryptSecret");
      expect(content).not.toContain("importMasterKey");
    });

    it(`${shortName} does not contain apiKeyStore`, () => {
      expect(read(file)).not.toContain("apiKeyStore");
    });

    it(`${shortName} does not contain createHmac`, () => {
      expect(read(file)).not.toContain("createHmac");
    });
  }
});

// ─── Middleware ──────────────────────────────────────────

describe("Phase 5.21 — Middleware Not Modified", () => {
  it("middleware allowlist does not contain /api/testnet", () => {
    const middleware = read("middleware.ts");
    const allowlistMatch = middleware.match(/\/api\/[a-z-]+/g);
    if (allowlistMatch) {
      const testnetRoute = allowlistMatch.find((p) => p.includes("testnet"));
      expect(testnetRoute, "middleware allowlist contains /api/testnet").toBeUndefined();
    }
  });
});

// ─── Docs Assertions ────────────────────────────────────

describe("Phase 5.21 — Docs Assertions", () => {
  const closure = read("docs/PHASE_5_TESTNET_PREFLIGHT_CLOSURE.md");

  it("declares no-real-testnet", () => {
    expect(closure).toContain("No-Real-Testnet");
    expect(closure).toContain("所有 route 返回 403");
  });

  it("declares no-secret-access", () => {
    expect(closure).toContain("No-Secret-Access");
    expect(closure).toContain("不调用 `apiKeyStore`");
  });

  it("declares no-secret-decryption", () => {
    expect(closure).toContain("No-Secret-Decryption");
    expect(closure).toContain("无 `decryptSecret`");
  });

  it("declares no-signing", () => {
    expect(closure).toContain("No-Signing");
    expect(closure).toContain("无 `createHmac`");
  });

  it("declares no-fetch", () => {
    expect(closure).toContain("No-Fetch");
    expect(closure).toContain("无 `fetch(`");
  });

  it("declares no-middleware-change", () => {
    expect(closure).toContain("No-Middleware-Change");
    expect(closure).toContain("未加入 middleware mutation allowlist");
  });

  it("states Phase 5.22 blocked pending code review", () => {
    expect(closure).toContain("Phase 5.22");
    expect(closure).toContain("Code Review Fixes");
    expect(closure).toContain("BLOCKED");
  });

  it("lists Phase 5.16–5.20 completed modules", () => {
    expect(closure).toContain("5.16");
    expect(closure).toContain("5.17");
    expect(closure).toContain("5.18");
    expect(closure).toContain("5.19");
    expect(closure).toContain("5.20");
  });

  it("contains full skeleton link diagram", () => {
    expect(closure).toContain("env → guard → secretPolicy → permissionCheck");
  });
});
