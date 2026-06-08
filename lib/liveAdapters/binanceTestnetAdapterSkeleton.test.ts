import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBinanceTestnetAdapterSkeleton } from "./binanceTestnetAdapterSkeleton";

const defaultConfig = {
  exchangeId: "binance" as const,
  baseUrl: "https://testnet.binancefuture.com",
  rateLimitPerSecond: 10,
};

describe("binanceTestnetAdapterSkeleton", () => {
  const adapter = createBinanceTestnetAdapterSkeleton(defaultConfig);

  it("has correct identity", () => {
    expect(adapter.exchangeId).toBe("binance");
    expect(adapter.mode).toBe("design-only");
  });

  describe("validateEnvironment", () => {
    it("returns invalid when exchangeEnv is disabled (default)", async () => {
      const result = await adapter.validateEnvironment();
      expect(result.valid).toBe(false);
      expect(result.warnings.some((w) => w.includes("Skeleton"))).toBe(true);
    });

    it("returns invalid when exchangeEnv is sandbox", async () => {
      const sk = createBinanceTestnetAdapterSkeleton({ ...defaultConfig, exchangeEnv: "sandbox" });
      const result = await sk.validateEnvironment();
      expect(result.valid).toBe(false);
    });

    it("returns valid when exchangeEnv is testnet", async () => {
      const sk = createBinanceTestnetAdapterSkeleton({ ...defaultConfig, exchangeEnv: "testnet" });
      const result = await sk.validateEnvironment();
      expect(result.valid).toBe(true);
    });

    it("blocks LIVE_TRADING_ENABLED=true", async () => {
      const sk = createBinanceTestnetAdapterSkeleton({ ...defaultConfig, exchangeEnv: "testnet", liveTradingEnabled: true });
      const result = await sk.validateEnvironment();
      expect(result.valid).toBe(false);
    });

    it("blocks ALLOW_MAINNET_TRADING=true", async () => {
      const sk = createBinanceTestnetAdapterSkeleton({ ...defaultConfig, exchangeEnv: "testnet", allowMainnetTrading: true });
      const result = await sk.validateEnvironment();
      expect(result.valid).toBe(false);
    });
  });

  describe("checkPermissions", () => {
    it("returns disabled without calling any API", async () => {
      const result = await adapter.checkPermissions({ recordId: "test", encryptedRef: "test" });
      expect(result.valid).toBe(false);
      expect(result.warnings.some((w) => w.includes("permission-check-disabled"))).toBe(true);
    });
  });

  describe("placeTestnetOrder", () => {
    it("returns testnet-blocked result", async () => {
      const result = await adapter.placeTestnetOrder({
        exchangeId: "binance",
        symbol: "BTCUSDT",
        side: "Buy",
        orderType: "Market",
        quantity: 0.01,
        clientOrderId: "test-001",
      });
      expect(result.status).toBe("testnet-blocked");
      expect(result.source).toBe("testnet-skeleton");
      expect(result.errorMessage).toContain("disabled in skeleton");
    });
  });

  describe("cancelTestnetOrder", () => {
    it("returns false", async () => {
      const cancelled = await adapter.cancelTestnetOrder("order-001");
      expect(cancelled).toBe(false);
    });
  });

  describe("getTestnetOrderStatus", () => {
    it("returns testnet-unknown status", async () => {
      const result = await adapter.getTestnetOrderStatus("order-001");
      expect(result.status).toBe("testnet-unknown");
      expect(result.source).toBe("testnet-skeleton");
    });
  });
});

// ─── Static analysis ─────────────────────────────────────

describe("binanceTestnetAdapterSkeleton — static analysis", () => {
  it("implementation file does not contain fetch / axios / HMAC / decryptSecret / SDK", () => {
    const content = readFileSync(join(__dirname, "binanceTestnetAdapterSkeleton.ts"), "utf8");
    const importLines = content.split("\n").filter((l) => l.includes("from "));
    for (const line of importLines) {
      expect(line, `Forbidden dependency: ${line.trim()}`).not.toMatch(/fetch|axios|node-fetch|cross-fetch|hmac|decryptSecret|binance/i);
    }
  });
});
