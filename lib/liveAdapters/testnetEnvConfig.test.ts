/**
 * Testnet Environment Config Tests — Phase 5.16
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getDefaultTestnetEnvConfig, parseTestnetEnvConfig, validateTestnetEnvConfig } from "./testnetEnvConfig";
import type { TestnetEnvRaw } from "./testnetEnvTypes";

// ─── Default Config ──────────────────────────────────────

describe("getDefaultTestnetEnvConfig", () => {
  it("exchangeEnv is disabled", () => {
    const cfg = getDefaultTestnetEnvConfig();
    expect(cfg.exchangeEnv).toBe("disabled");
  });

  it("liveTradingEnabled is false", () => {
    expect(getDefaultTestnetEnvConfig().liveTradingEnabled).toBe(false);
  });

  it("allowMainnetTrading is false", () => {
    expect(getDefaultTestnetEnvConfig().allowMainnetTrading).toBe(false);
  });

  it("testnetRoutesEnabled is false", () => {
    expect(getDefaultTestnetEnvConfig().testnetRoutesEnabled).toBe(false);
  });

  it("testnetOrderSubmitEnabled is false", () => {
    expect(getDefaultTestnetEnvConfig().testnetOrderSubmitEnabled).toBe(false);
  });
});

// ─── Parse ───────────────────────────────────────────────

describe("parseTestnetEnvConfig", () => {
  it("returns defaults when env is empty", () => {
    const cfg = parseTestnetEnvConfig({});
    expect(cfg.exchangeEnv).toBe("disabled");
    expect(cfg.liveTradingEnabled).toBe(false);
  });

  it("parses exchangeEnv = testnet", () => {
    const cfg = parseTestnetEnvConfig({ EXCHANGE_ENV: "testnet" });
    expect(cfg.exchangeEnv).toBe("testnet");
  });

  it("parses exchangeEnv = sandbox", () => {
    const cfg = parseTestnetEnvConfig({ EXCHANGE_ENV: "sandbox" });
    expect(cfg.exchangeEnv).toBe("sandbox");
  });

  it("parses exchangeEnv = disabled (explicit)", () => {
    const cfg = parseTestnetEnvConfig({ EXCHANGE_ENV: "disabled" });
    expect(cfg.exchangeEnv).toBe("disabled");
  });

  it("parses unknown exchangeEnv as disabled", () => {
    const cfg = parseTestnetEnvConfig({ EXCHANGE_ENV: "production" });
    expect(cfg.exchangeEnv).toBe("disabled");
  });

  it("parses true booleans", () => {
    const cfg = parseTestnetEnvConfig({
      LIVE_TRADING_ENABLED: "true",
      ALLOW_MAINNET_TRADING: "1",
      TESTNET_ROUTES_ENABLED: "yes",
      TESTNET_ORDER_SUBMIT_ENABLED: "true",
    });
    expect(cfg.liveTradingEnabled).toBe(true);
    expect(cfg.allowMainnetTrading).toBe(true);
    expect(cfg.testnetRoutesEnabled).toBe(true);
    expect(cfg.testnetOrderSubmitEnabled).toBe(true);
  });

  it("parses false booleans", () => {
    const cfg = parseTestnetEnvConfig({
      LIVE_TRADING_ENABLED: "false",
      ALLOW_MAINNET_TRADING: "0",
      TESTNET_ROUTES_ENABLED: "no",
      TESTNET_ORDER_SUBMIT_ENABLED: "false",
    });
    expect(cfg.liveTradingEnabled).toBe(false);
    expect(cfg.allowMainnetTrading).toBe(false);
    expect(cfg.testnetRoutesEnabled).toBe(false);
    expect(cfg.testnetOrderSubmitEnabled).toBe(false);
  });
});

// ─── Validate ────────────────────────────────────────────

describe("validateTestnetEnvConfig", () => {
  it("default config is valid", () => {
    const result = validateTestnetEnvConfig(getDefaultTestnetEnvConfig());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("allowMainnetTrading=true is invalid", () => {
    const result = validateTestnetEnvConfig({ ...getDefaultTestnetEnvConfig(), allowMainnetTrading: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("ALLOW_MAINNET_TRADING"))).toBe(true);
  });

  it("liveTradingEnabled=true is invalid", () => {
    const result = validateTestnetEnvConfig({ ...getDefaultTestnetEnvConfig(), liveTradingEnabled: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("LIVE_TRADING_ENABLED"))).toBe(true);
  });

  it("testnetOrderSubmitEnabled=true is invalid in Phase 5.16", () => {
    const result = validateTestnetEnvConfig({ ...getDefaultTestnetEnvConfig(), testnetOrderSubmitEnabled: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("TESTNET_ORDER_SUBMIT_ENABLED"))).toBe(true);
  });

  it("testnetRoutesEnabled=true issues a warning but is not invalid", () => {
    const result = validateTestnetEnvConfig({ ...getDefaultTestnetEnvConfig(), testnetRoutesEnabled: true });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("TESTNET_ROUTES_ENABLED"))).toBe(true);
  });

  it("multiple errors combined", () => {
    const result = validateTestnetEnvConfig({
      ...getDefaultTestnetEnvConfig(),
      allowMainnetTrading: true,
      liveTradingEnabled: true,
      testnetOrderSubmitEnabled: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(3);
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("testnetEnvConfig — static analysis", () => {
  const files = ["testnetEnvConfig.ts", "testnetEnvTypes.ts"];

  for (const file of files) {
    it(`${file} does not contain decryptSecret / importMasterKey`, () => {
      const content = readFileSync(join(__dirname, file), "utf8");
      expect(content).not.toContain("decryptSecret");
      expect(content).not.toContain("importMasterKey");
    });

    it(`${file} does not contain fetch(`, () => {
      const content = readFileSync(join(__dirname, file), "utf8");
      const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(noComments).not.toContain("fetch(");
    });

    it(`${file} does not contain axios`, () => {
      const content = readFileSync(join(__dirname, file), "utf8");
      expect(content).not.toContain("axios");
    });

    it(`${file} does not contain createHmac`, () => {
      const content = readFileSync(join(__dirname, file), "utf8");
      expect(content).not.toContain("createHmac");
    });
  }
});
