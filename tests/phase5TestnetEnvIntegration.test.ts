/**
 * Phase 5.17 Testnet Env Integration Skeleton Tests
 *
 * Verifies that blockedResponse reads and validates env config,
 * returns env metadata in response, but still returns 403 blocked.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const helper = read("app/api/testnet/_shared/blockedResponse.ts");

// ─── Imports env config ─────────────────────────────────

describe("Phase 5.17 — blockedResponse imports env config", () => {
  it("imports parseTestnetEnvConfig", () => {
    expect(helper).toContain("parseTestnetEnvConfig");
  });

  it("imports validateTestnetEnvConfig", () => {
    expect(helper).toContain("validateTestnetEnvConfig");
  });

  it("reads process.env in buildGuardedBlockedResponseWithRateLimit", () => {
    expect(helper).toContain("process.env.EXCHANGE_ENV");
    expect(helper).toContain("process.env.TESTNET_ROUTES_ENABLED");
    expect(helper).toContain("process.env.TESTNET_ORDER_SUBMIT_ENABLED");
  });

  it("response body includes env metadata", () => {
    expect(helper).toContain("env: envMeta");
    expect(helper).toContain("exchangeEnv: envConfig.exchangeEnv");
    expect(helper).toContain("valid: envValidation.valid");
    expect(helper).toContain("warnings: envValidation.warnings");
    expect(helper).toContain("errors: envValidation.errors");
  });
});

// ─── No Forbidden Code ──────────────────────────────────

describe("Phase 5.17 — No Forbidden Code in blockedResponse", () => {
  const noComments = helper.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("does not contain fetch(", () => {
    expect(noComments).not.toContain("fetch(");
  });

  it("does not contain axios", () => {
    expect(helper).not.toContain("axios");
  });

  it("does not contain createHmac / crypto.subtle.sign", () => {
    expect(helper).not.toContain("createHmac");
    expect(helper).not.toContain("crypto.subtle.sign");
  });

  it("does not contain decryptSecret / importMasterKey", () => {
    expect(helper).not.toContain("decryptSecret");
    expect(helper).not.toContain("importMasterKey");
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

// ─── Middleware ──────────────────────────────────────────

describe("Phase 5.17 — Middleware Not Modified", () => {
  it("middleware allowlist does not contain /api/testnet", () => {
    const middleware = read("middleware.ts");
    const allowlistMatch = middleware.match(/\/api\/[a-z-]+/g);
    if (allowlistMatch) {
      const testnetRoute = allowlistMatch.find((p) => p.includes("testnet"));
      expect(testnetRoute, "middleware allowlist contains /api/testnet").toBeUndefined();
    }
  });
});

// ─── Static Analysis — env config files ─────────────────

describe("Phase 5.17 — Static Analysis of env config files", () => {
  const files = [
    "lib/liveAdapters/testnetEnvTypes.ts",
    "lib/liveAdapters/testnetEnvConfig.ts",
  ];

  for (const file of files) {
    it(`${file} does not contain fetch/axios/decryptSecret/createHmac`, () => {
      const content = read(file);
      const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(noComments).not.toContain("fetch(");
      expect(content).not.toContain("axios");
      expect(content).not.toContain("decryptSecret");
      expect(content).not.toContain("importMasterKey");
      expect(content).not.toContain("createHmac");
    });
  }
});
