/**
 * Phase 5.7.1 Binance Testnet Skeleton Boundary Tests
 *
 * Verifies the skeleton remains in design-only mode:
 * - No fetch / axios / HMAC / decryptSecret / SDK
 * - placeTestnetOrder only returns blocked/disabled
 * - cancelTestnetOrder returns false
 * - middleware unchanged
 * - docs state skeleton ≠ real testnet
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBinanceTestnetAdapterSkeleton } from "../lib/liveAdapters/binanceTestnetAdapterSkeleton";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

// ─── Runtime Behavior ───────────────────────────────────

describe("Binance Skeleton — Runtime", () => {
  const adapter = createBinanceTestnetAdapterSkeleton({
    exchangeId: "binance",
    baseUrl: "https://testnet.binancefuture.com",
    rateLimitPerSecond: 10,
  });

  it("placeTestnetOrder only returns testnet-blocked", async () => {
    const result = await adapter.placeTestnetOrder({
      exchangeId: "binance",
      symbol: "BTCUSDT",
      side: "Buy",
      orderType: "Market",
      quantity: 0.01,
      clientOrderId: "t",
    });
    // Must NOT return sandbox-submitted, sandbox-filled, or any real order status
    expect(result.status).not.toBe("sandbox-submitted");
    expect(result.status).not.toBe("sandbox-filled");
    expect(result.status).not.toBe("sandbox-ready");
    // Must be skeleton-only status
    expect(["testnet-blocked", "testnet-disabled"]).toContain(result.status);
  });

  it("cancelTestnetOrder returns false", async () => {
    expect(await adapter.cancelTestnetOrder("any")).toBe(false);
  });
});

// ─── Static Analysis ────────────────────────────────────

describe("Binance Skeleton — Static Analysis", () => {
  const content = read("lib/liveAdapters/binanceTestnetAdapterSkeleton.ts");
  const importLines = content.split("\n").filter((l) => l.includes("from "));

  it("does not contain fetch(", () => {
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(noComments).not.toContain("fetch(");
  });

  it("does not contain axios", () => {
    expect(content).not.toContain("axios");
  });

  it("does not contain HMAC / createHmac / crypto.subtle.sign", () => {
    expect(content).not.toContain("Hmac");
    expect(content).not.toContain("createHmac");
    expect(content).not.toContain("crypto.subtle.sign");
  });

  it("does not contain decryptSecret / importMasterKey", () => {
    expect(content).not.toContain("decryptSecret");
    expect(content).not.toContain("importMasterKey");
  });

  it("does not contain plaintext secret handling", () => {
    expect(content).not.toContain("apiSecret");
    expect(content).not.toContain("api_secret");
    expect(content).not.toContain("secretKey");
  });

  it("does not import Binance SDK", () => {
    for (const line of importLines) {
      expect(line).not.toMatch(/binance|@binance/i);
    }
  });
});

// ─── Middleware ──────────────────────────────────────────

describe("Binance Skeleton — Middleware", () => {
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

describe("Binance Skeleton — Docs", () => {
  it("REAL_TESTNET_ADAPTER_DESIGN.md states skeleton is not real testnet", () => {
    const content = read("docs/REAL_TESTNET_ADAPTER_DESIGN.md");
    expect(content).toContain("Skeleton");
    expect(content).toContain("不连接 Binance Testnet");
    expect(content).toContain("disabled");
    expect(content).toContain("blocked");
  });
});
