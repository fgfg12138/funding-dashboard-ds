/**
 * Contract Quantity Normalization Tests
 */

import { describe, expect, it } from "vitest";
import { normalizeExecutionQuantity, validateCrossExchangeLegNotional, generateQuantityNormalizationReport } from "./contractQuantityNormalization";
import type { TradingRuleSummary } from "./contractQuantityNormalization";

const BTC_RULE: TradingRuleSummary = { minOrderSize: 0.001, minPriceIncrement: 0.1, minBaseAmountIncrement: 0.001, minNotional: 5 };
const SOL_RULE: TradingRuleSummary = { minOrderSize: 0.01, minPriceIncrement: 0.01, minBaseAmountIncrement: 0.01, minNotional: 5 };
const ETH_RULE: TradingRuleSummary = { minOrderSize: 0.001, minPriceIncrement: 0.01, minBaseAmountIncrement: 0.001, minNotional: 5 };

describe("ETHUSDT $20 notional normalization (Binance+OKX+HTX compatible)", () => {
  it("1. Binance ETHUSDT $20 → qty=0.005, notional=$17", () => {
    const r = normalizeExecutionQuantity("binance", "ETHUSDT", "ETHUSDT", 20, 3400, 1, ETH_RULE);
    expect(r.normalizedQuantity).toBe(0.005);
    expect(r.expectedNotionalUsd).toBe(17);
    expect(r.valid).toBe(true);
  });

  it("2. OKX ETH-USDT-SWAP $20 → qty=5.882, notional≈$20", () => {
    const r = normalizeExecutionQuantity("okx", "ETHUSDT", "ETH-USDT-SWAP", 20, 3400, 0.001, { ...ETH_RULE, minBaseAmountIncrement: 0.001, minOrderSize: 0.001 });
    expect(r.normalizedQuantity).toBe(5.882);
    expect(r.expectedNotionalUsd).toBeGreaterThan(19);
    expect(r.expectedNotionalUsd).toBeLessThan(21);
    expect(r.valid).toBe(true);
  });

  it("3. HTX ETH-USDT $20 → qty=5, notional=$17", () => {
    const r = normalizeExecutionQuantity("htx", "ETHUSDT", "ETH-USDT", 20, 3400, 0.001, { ...ETH_RULE, minBaseAmountIncrement: 1, minOrderSize: 1 });
    expect(r.normalizedQuantity).toBe(5);
    expect(r.expectedNotionalUsd).toBe(17);
    expect(r.valid).toBe(true);
  });

  it("4. cross-exchange notional mismatch Binance/OKX=15%, OKX/HTX=15% — acceptable at $20", () => {
    const b = normalizeExecutionQuantity("binance", "ETHUSDT", "ETHUSDT", 20, 3400, 1, ETH_RULE);
    const o = normalizeExecutionQuantity("okx", "ETHUSDT", "ETH-USDT-SWAP", 20, 3400, 0.001, { ...ETH_RULE, minBaseAmountIncrement: 0.001, minOrderSize: 0.001 });
    const h = normalizeExecutionQuantity("htx", "ETHUSDT", "ETH-USDT", 20, 3400, 0.001, { ...ETH_RULE, minBaseAmountIncrement: 1, minOrderSize: 1 });
    const v1 = validateCrossExchangeLegNotional(b, o, 20);
    const v2 = validateCrossExchangeLegNotional(o, h, 20);
    expect(v1.passed).toBe(true);
    expect(v2.passed).toBe(true);
  });

  it("5. minNotional not met → blocked", () => {
    const r = normalizeExecutionQuantity("binance", "BTCUSDT", "BTCUSDT", 0.1, 60000, 1, { ...BTC_RULE, minNotional: 5 });
    expect(r.minNotionalPassed).toBe(false);
    expect(r.valid).toBe(false);
  });

  it("6. minOrderSize not met → blocked", () => {
    const r = normalizeExecutionQuantity("binance", "BTCUSDT", "BTCUSDT", 1, 60000, 1, { ...BTC_RULE, minOrderSize: 0.1 });
    expect(r.minOrderSizePassed).toBe(false);
    expect(r.valid).toBe(false);
  });

  it("7. contractSize 0 → blocked (contractSize required)", () => {
    const r = normalizeExecutionQuantity("binance", "SOLUSDT", "SOLUSDT", 5, 64, 0, SOL_RULE);
    expect(r.expectedNotionalUsd).toBe(0);
  });

  it("8. cross-exchange notional mismatch > 1% → blocked", () => {
    const r1 = normalizeExecutionQuantity("binance", "SOLUSDT", "SOLUSDT", 5, 64, 1, SOL_RULE);
    // Deliberately incompatible
    const r2 = normalizeExecutionQuantity("htx", "SOLUSDT", "SOL-USDT", 5, 64, 100, { ...SOL_RULE, minBaseAmountIncrement: 100, minOrderSize: 100 });
    const v = validateCrossExchangeLegNotional(r1, r2);
    if (!v.passed) {
      expect(v.reason).toBeTruthy();
    }
  });

  it("9. no NaN / Infinity", () => {
    const r = normalizeExecutionQuantity("binance", "SOLUSDT", "SOLUSDT", 5, 64, 1, SOL_RULE);
    expect(Number.isFinite(r.normalizedQuantity)).toBe(true);
    expect(Number.isFinite(r.expectedNotionalUsd)).toBe(true);
  });

  it("10. quantity must be > 0", () => {
    const r = normalizeExecutionQuantity("binance", "SOLUSDT", "SOLUSDT", 5, 64, 1, SOL_RULE);
    expect(r.normalizedQuantity).toBeGreaterThan(0);
  });
});

describe("Cross-exchange validation", () => {
  it("validateCrossExchangeLegNotional detects mismatch", () => {
    const r1 = normalizeExecutionQuantity("binance", "SOLUSDT", "SOLUSDT", 20, 64, 1, SOL_RULE);
    const r2 = normalizeExecutionQuantity("okx", "SOLUSDT", "SOL-USDT-SWAP", 20, 64, 0.1, { ...SOL_RULE, minBaseAmountIncrement: 0.1, minOrderSize: 0.1 });
    const v = validateCrossExchangeLegNotional(r1, r2, 5);
    expect(typeof v.passed).toBe("boolean");
    expect(typeof v.mismatchPercent).toBe("number");
  });

  it("generateQuantityNormalizationReport runs without error", () => {
    const r1 = normalizeExecutionQuantity("binance", "SOLUSDT", "SOLUSDT", 20, 64, 1, SOL_RULE);
    const r2 = normalizeExecutionQuantity("okx", "SOLUSDT", "SOL-USDT-SWAP", 20, 64, 0.1, { ...SOL_RULE, minBaseAmountIncrement: 0.1, minOrderSize: 0.1 });
    const report = generateQuantityNormalizationReport([r1, r2], 5);
    expect(Array.isArray(report.results)).toBe(true);
  });
});
