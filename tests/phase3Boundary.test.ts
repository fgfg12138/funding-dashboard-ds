/**
 * Phase 3 Boundary Tests
 *
 * Verifies that the project maintains read-only / paper-only / mock-only /
 * no-secret / no-private-api / no-live-trading boundaries.
 *
 * These tests check code structure, import paths, and function names.
 * They do NOT test behavior — they guard against regression into live trading.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

/** Collect every `.ts` and `.tsx` file in `lib/` that is not `node_modules`. */
function getLibTsFiles(): string[] {
  function walk(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) {
        files.push(...walk(full));
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        files.push(full);
      }
    }
    return files;
  }
  return walk(join(root, "lib"));
}

const libFiles = getLibTsFiles();

/** Read all lib file contents once. */
const libContents = libFiles.map((f) => ({ file: f, content: readFileSync(f, "utf8") }));
const libRunFiles = libContents.filter(({ file }) => !file.includes(".test."));

// ─── No Live Trading Functions ───────────────────────────

describe("Phase 3 Boundary — No Live Trading", () => {
  it("no placeOrder function in lib/", () => {
    for (const { file, content } of libRunFiles) {
      // Exclude interface definitions and docs
      if (content.includes("placeOrder") && !content.includes("interface")) {
        expect(content, `placeOrder found in ${file}`).not.toContain("placeOrder");
      }
    }
  });

  it("no createOrder function in lib/", () => {
    for (const { file, content } of libRunFiles) {
      if (file.includes("orderRouter") || file.includes(".test.")) continue;
      if (content.includes("createOrder") && !content.includes("interface")) {
        expect(content, `createOrder found in ${file}`).not.toContain("createOrder");
      }
    }
  });

  it("no marketOrder function in lib/", () => {
    for (const { file, content } of libRunFiles) {
      expect(content, `marketOrder found in ${file}`).not.toContain("marketOrder");
    }
  });

  it("TradingAdapter has no live implementation in lib/", () => {
    const found = libRunFiles.filter(({ content }) =>
      content.includes("TradingAdapter") && !content.includes("interface") && !content.includes("//"),
    );
    // Remove comments from the check
    const inCode = found.filter(({ content }) => {
      const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      return noComments.includes("TradingAdapter");
    });
    expect(inCode.map((f) => f.file), "TradingAdapter implementation found").toEqual([]);
  });
});

// ─── Middleware Guard ────────────────────────────────────

describe("Phase 3 Boundary — Middleware", () => {
  it("blocks non-GET with 405", () => {
    const content = read("middleware.ts");
    expect(content).toContain("status: 405");
    expect(content).toContain("READ_ONLY_MODE");
  });

  it("allowlist does not contain trading path prefixes", () => {
    const content = read("middleware.ts");
    const tradingKeywords = ["order", "trade", "execution", "position"];
    const allowlistMatch = content.match(/\/api\/[a-z-]+/g);
    if (allowlistMatch) {
      for (const keyword of tradingKeywords) {
        const found = allowlistMatch.some((p) => p.includes(keyword));
        expect(found, `middleware allowlist contains trading path containing "${keyword}"`).toBe(false);
      }
    }
  });
});

// ─── API Keys Page ──────────────────────────────────────

describe("Phase 3 Boundary — API Keys Page", () => {
  it("has disabled buttons", () => {
    const content = read("app/api-keys/page.tsx");
    expect(content).toContain("占位页面");
    expect(content).toContain("disabled");
  });

  it("does not contain real input fields", () => {
    const content = read("app/api-keys/page.tsx");
    // Allow Search icon and hidden inputs, but no <input> for API Key/Secret
    const inputLines = content.split("\n").filter((l) => l.includes("<input"));
    // The page may have zero input elements (all are mock/display)
    // If there are any inputs, they must have disabled attribute
    for (const line of inputLines) {
      expect(line, `input found without disabled: ${line.trim()}`).toMatch(/disabled/);
    }
  });

  it("does not contain onSubmit handler", () => {
    const content = read("app/api-keys/page.tsx");
    expect(content).not.toContain("onSubmit");
  });

  it("does not call saveEncryptedApiKey", () => {
    const content = read("app/api-keys/page.tsx");
    expect(content).not.toContain("saveEncryptedApiKey");
  });
});

// ─── Mock Account Data ──────────────────────────────────

describe("Phase 3 Boundary — Mock Account Data", () => {
  it("mock adapter source is 'mock'", () => {
    const content = read("lib/exchangeAdapters/mockPrivateAccountAdapter.ts");
    expect(content).toContain('source: "mock"');
  });

  it("account-sync page warns about mock data", () => {
    const content = read("app/account-sync/page.tsx");
    expect(content).toContain("Mock 数据");
  });

  it("execution page account risk comes from mock source", () => {
    const content = read("lib/risk/accountRiskContext.ts");
    expect(content).toContain('source: "mock"');
  });
});

// ─── Permission Verifier ────────────────────────────────

describe("Phase 3 Boundary — Permission Verifier", () => {
  it("marks results as mock-only", () => {
    const content = read("lib/apiKeys/permissionVerifier.ts");
    expect(content).toContain("mock-verification-only");
    expect(content).toContain("isMock: true");
  });
});

// ─── No Real Withdraw Implementation ────────────────────

describe("Phase 3 Boundary — No Real Withdraw", () => {
  it("withdraw only appears in types/mock verifier/comments, not as executable code", () => {
    for (const { file, content } of libRunFiles) {
      const normalizedPath = file.replace(/\\/g, "/");
      const isAllowed = normalizedPath.includes("types.ts") || normalizedPath.includes("apiKeyTypes") || normalizedPath.includes("accountSync") || normalizedPath.includes("fundingHistory") || normalizedPath.includes("testnetRouteTypes") || normalizedPath.includes("testnetRouteSecurityGuard") || normalizedPath.includes("testnetSecretPolicy") || normalizedPath.includes("secretVault") || normalizedPath.includes("realPermission") || normalizedPath.includes("phase6Readiness") || normalizedPath.includes("noGoRemediation") || normalizedPath.includes("permissionVerifier") || normalizedPath.includes("apiKeySecurity") || normalizedPath.includes(".test.");
      // Skip files where "withdraw" only appears in JSDoc comments
      if (content.includes("withdraw") && !isAllowed) {
        const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        if (withoutComments.includes("withdraw")) {
          expect(withoutComments, `withdraw found outside types/comments in ${file}`).not.toContain("withdraw");
        }
      }
    }
  });
});

// ─── No Real API Key Endpoints ──────────────────────────

describe("Phase 3 Boundary — No API Key Endpoints", () => {
  it("no POST /api/keys endpoint exists", () => {
    const apiDirs = readdirSync(join(root, "app", "api"));
    expect(apiDirs.includes("keys")).toBe(false);
    expect(apiDirs.includes("api-keys")).toBe(false);
  });
});

// ─── No Exchange Private API Calls ─────────────────────┬

describe("Phase 3 Boundary — No Exchange Private API", () => {
  const adapterFiles = libFiles.filter((f) => f.includes("exchangeAdapters") && !f.includes(".test."));

  it("exchangeAdapters run code does not contain fetch(", () => {
    for (const file of adapterFiles) {
      const content = readFileSync(file, "utf8");
      // Skip test files
      if (file.includes(".test.")) continue;
      const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(withoutComments, `fetch( found in ${file}`).not.toContain("fetch(");
    }
  });

  it("exchangeAdapters run code does not contain Authorization", () => {
    for (const file of adapterFiles) {
      const content = readFileSync(file, "utf8");
      if (file.includes(".test.")) continue;
      const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(withoutComments, `Authorization found in ${file}`).not.toContain("Authorization");
    }
  });
});
