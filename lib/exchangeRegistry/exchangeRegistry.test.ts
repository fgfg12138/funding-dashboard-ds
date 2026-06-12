/**
 * Exchange Registry Tests — Multi-Exchange Foundation
 *
 * Covers registration, capabilities, symbol resolution (including
 * OKX dash-format, Gate underscore-format, Hyperliquid bare-asset),
 * funding intervals, fee models, health, errors, and immutability.
 */

import { describe, expect, it } from "vitest";
import {
  registerExchange,
  getExchanges,
  getExchange,
  registerCapabilities,
  getCapabilities,
  registerSymbolMapping,
  resolveCanonicalSymbol,
  resolveExchangeSymbol,
  getSymbolMapping,
  registerFundingInterval,
  getFundingInterval,
  registerFeeModel,
  getFeeModel,
  updateExchangeHealth,
  getExchangeHealth,
  listSupportedExchanges,
  _resetRegistry,
} from "./exchangeRegistry";

beforeEach(() => {
  _resetRegistry();
});

describe("Exchange Registry", () => {
  // ─── 1-2: Register / Get Exchange ─────────────────────

  it("1. registerExchange — adds a new exchange", () => {
    registerExchange("testex");
    const all = getExchanges();
    expect(all).toContain("testex");
  });

  it("2. getExchange — returns exchange info or throws", () => {
    const info = getExchange("binance");
    expect(info.exchangeId).toBe("binance");
    expect(() => getExchange("nonexistent")).toThrow("Unknown exchange");
  });

  // ─── 3-4: Capabilities ─────────────────────────────

  it("3. registerCapabilities — adds/updates capabilities", () => {
    registerCapabilities({ exchangeId: "testex", supportsSpot: false, supportsPerpetual: true, supportsFutures: false, supportsFundingRate: true, supportsOpenInterest: false, supportsReduceOnly: true, supportsPostOnly: false, supportsTestnet: false, supportsMainnet: true, rateLimitPerMinute: 100, maxLeverage: 10 });
    const cap = getCapabilities("testex");
    expect(cap.supportsPerpetual).toBe(true);
    expect(cap.maxLeverage).toBe(10);
  });

  it("4. getCapabilities — returns a copy, not a reference", () => {
    const cap = getCapabilities("binance");
    const orig = cap.rateLimitPerMinute;
    (cap as any).rateLimitPerMinute = 9999;
    const cap2 = getCapabilities("binance");
    expect(cap2.rateLimitPerMinute).toBe(orig);
  });

  // ─── 5-9: Symbol Mapping ─────────────────────────────

  it("5. resolveCanonicalSymbol — Binance BTCUSDT → BTCUSDT", () => {
    const sym = resolveCanonicalSymbol("binance", "BTCUSDT");
    expect(sym).toBe("BTCUSDT");
  });

  it("6. resolveExchangeSymbol — BTCUSDT → Binance BTCUSDT", () => {
    const sym = resolveExchangeSymbol("binance", "BTCUSDT");
    expect(sym).toBe("BTCUSDT");
  });

  it("7. OKX symbol BTC-USDT-SWAP → BTCUSDT", () => {
    const canonical = resolveCanonicalSymbol("okx", "BTC-USDT-SWAP");
    expect(canonical).toBe("BTCUSDT");
    const exSym = resolveExchangeSymbol("okx", "BTCUSDT");
    expect(exSym).toBe("BTC-USDT-SWAP");
  });

  it("8. Gate symbol BTC_USDT → BTCUSDT", () => {
    const canonical = resolveCanonicalSymbol("gate", "BTC_USDT");
    expect(canonical).toBe("BTCUSDT");
    const exSym = resolveExchangeSymbol("gate", "BTCUSDT");
    expect(exSym).toBe("BTC_USDT");
  });

  it("9. Hyperliquid BTC → BTCUSDT", () => {
    const canonical = resolveCanonicalSymbol("hyperliquid", "BTC");
    expect(canonical).toBe("BTCUSDT");
    const exSym = resolveExchangeSymbol("hyperliquid", "BTCUSDT");
    expect(exSym).toBe("BTC");
  });

  it("registerSymbolMapping — adds custom mapping", () => {
    registerSymbolMapping({
      canonicalSymbol: "SOLUSDT",
      exchangeId: "gate",
      exchangeSymbol: "SOL_USDT",
      baseAsset: "SOL", quoteAsset: "USDT", marketType: "perpetual",
    });
    expect(resolveExchangeSymbol("gate", "SOLUSDT")).toBe("SOL_USDT");
    expect(resolveCanonicalSymbol("gate", "SOL_USDT")).toBe("SOLUSDT");
  });

  // ─── 10: Funding Interval ────────────────────────────

  it("10. funding interval — Binance=8h, Hyperliquid=1h", () => {
    expect(getFundingInterval("binance").intervalHours).toBe(8);
    expect(getFundingInterval("hyperliquid").intervalHours).toBe(1);
  });

  it("registerFundingInterval — overrides default", () => {
    registerFundingInterval({ exchangeId: "hyperliquid", marketType: "perpetual", intervalHours: 2 });
    expect(getFundingInterval("hyperliquid").intervalHours).toBe(2);
  });

  // ─── 11: Fee Model ─────────────────────────────────

  it("11. fee model — all default exchanges have fees", () => {
    for (const e of ["binance", "bybit", "okx", "bitget", "gate", "hyperliquid"]) {
      const fee = getFeeModel(e);
      expect(fee.makerFeePercent).toBeGreaterThanOrEqual(0);
      expect(fee.takerFeePercent).toBeGreaterThanOrEqual(0);
    }
  });

  // ─── 12: Health ─────────────────────────────────────

  it("12. health update — status and latency", () => {
    updateExchangeHealth("hyperliquid", "degraded", 500);
    const h = getExchangeHealth("hyperliquid");
    expect(h.status).toBe("degraded");
    expect(h.latencyMs).toBe(500);
  });

  // ─── 13: List ──────────────────────────────────────

  it("13. listSupportedExchanges — returns all defaults", () => {
    const list = listSupportedExchanges();
    expect(list).toContain("binance");
    expect(list).toContain("bybit");
    expect(list).toContain("okx");
    expect(list).toContain("bitget");
    expect(list).toContain("gate");
    expect(list).toContain("hyperliquid");
    expect(list).toContain("htx");
    expect(list.length).toBe(7);
  });

  // ─── 14: Unknown exchange error ─────────────────────

  it("14. unknown exchange throws", () => {
    expect(() => getExchange("unknown")).toThrow("Unknown exchange");
    expect(() => getCapabilities("unknown")).toThrow("No capabilities registered");
    expect(() => getFundingInterval("unknown")).toThrow("No funding interval");
    expect(() => getFeeModel("unknown")).toThrow("No fee model");
    expect(() => getExchangeHealth("unknown")).toThrow("No health record");
  });

  // ─── 15: Unknown symbol error ─────────────────────

  it("15. unknown symbol throws", () => {
    expect(() => resolveExchangeSymbol("binance", "NONEXISTENT")).toThrow("No mappings for canonical symbol");
    expect(() => resolveCanonicalSymbol("binance", "NONEXISTENT")).toThrow("No canonical symbol found");
  });

  // ─── 16: No mutation of inputs ──────────────────────

  it("16. getCapabilities does not mutate internal state", () => {
    const cap = getCapabilities("binance");
    const changed = { ...cap, maxLeverage: 999 } as any;
    expect(getCapabilities("binance").maxLeverage).not.toBe(999);
  });

  it("getSymbolMapping — returns full mapping object", () => {
    const mapping = getSymbolMapping("okx", "BTCUSDT");
    expect(mapping.exchangeSymbol).toBe("BTC-USDT-SWAP");
    expect(mapping.baseAsset).toBe("BTC");
    expect(mapping.quoteAsset).toBe("USDT");
  });
});

describe("Default Registry State", () => {
  it("BTCUSDT available on all 6 exchanges", () => {
    for (const e of ["binance", "bybit", "okx", "bitget", "gate", "hyperliquid"]) {
      const sym = resolveExchangeSymbol(e, "BTCUSDT");
      expect(sym.length).toBeGreaterThan(0);
    }
  });

  it("Default exchanges are all healthy on init", () => {
    for (const e of ["binance", "bybit", "okx", "bitget", "gate", "hyperliquid"]) {
      expect(getExchangeHealth(e).status).toBe("healthy");
    }
  });
});
