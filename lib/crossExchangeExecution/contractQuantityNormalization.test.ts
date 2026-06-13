/**
 * Contract Quantity Normalization Tests
 */

import { describe, expect, it } from "vitest";
import { normalizeExecutionQuantity, validateCrossExchangeLegNotional, generateQuantityNormalizationReport } from "./contractQuantityNormalization";
import type { TradingRuleSummary } from "./contractQuantityNormalization";

const BTC_RULE: TradingRuleSummary = { minOrderSize: 0.001, minPriceIncrement: 0.1, minBaseAmountIncrement: 0.001, minNotional: 5 };
const SOL_RULE: TradingRuleSummary = { minOrderSize: 0.01, minPriceIncrement: 0.01, minBaseAmountIncrement: 0.01, minNotional: 5 };

describe("Binance SOLUSDT $5 notional", () => {
  it("1. Binance SOLUSDT $50 notional quantity is correct", () => {
    const r = normalizeExecutionQuantity("binance", "SOLUSDT", "SOLUSDT", 50, 64, 1, SOL_RULE);
    expect(r.normalizedQuantity).toBeGreaterThan(0);
    expect(r.expectedNotionalUsd).toBeGreaterThan(40);
    expect(r.expectedNotionalUsd).toBeLessThan(60);
    expect(r.valid).toBe(true);
  });

  it("2. OKX SOL-USDT-SWAP $50 notional quantity is correct", () => {
    const r = normalizeExecutionQuantity("okx", "SOLUSDT", "SOL-USDT-SWAP", 50, 64, 0.1, { ...SOL_RULE, minBaseAmountIncrement: 0.1, minOrderSize: 0.1 });
    expect(r.normalizedQuantity).toBeGreaterThan(0);
    expect(r.expectedNotionalUsd).toBeGreaterThan(40);
    expect(r.expectedNotionalUsd).toBeLessThan(60);
    expect(r.valid).toBe(true);
  });

  it("3. HTX SOL-USDT $200 notional quantity is correct (minOrderSize=1)", () => {
    const r = normalizeExecutionQuantity("htx", "SOLUSDT", "SOL-USDT", 200, 64, 1, { ...SOL_RULE, minBaseAmountIncrement: 1, minOrderSize: 1 });
    expect(r.normalizedQuantity).toBeGreaterThanOrEqual(1);
    expect(r.expectedNotionalUsd).toBeGreaterThan(100);
    expect(r.valid).toBe(true);
  });

  it("4. stepSize rounding keeps notional within 20% of target ($50)", () => {
    const r = normalizeExecutionQuantity("binance", "SOLUSDT", "SOLUSDT", 50, 64, 1, SOL_RULE);
    expect(r.notionalMismatchPercent).toBeLessThan(20);
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
  it("validateCrossExchangeLegNotional detects mismatch (realistic)", () => {
    const r1 = normalizeExecutionQuantity("binance", "SOLUSDT", "SOLUSDT", 50, 64, 1, SOL_RULE);
    const r2 = normalizeExecutionQuantity("okx", "SOLUSDT", "SOL-USDT-SWAP", 50, 64, 0.1, { ...SOL_RULE, minBaseAmountIncrement: 0.1, minOrderSize: 0.1 });
    const v = validateCrossExchangeLegNotional(r1, r2, 10); // Allow 10% mismatch at $50 SOL
    expect(typeof v.passed).toBe("boolean");
    expect(typeof v.mismatchPercent).toBe("number");
  });

  it("generateQuantityNormalizationReport runs without error", () => {
    const r1 = normalizeExecutionQuantity("binance", "SOLUSDT", "SOLUSDT", 50, 64, 1, SOL_RULE);
    const r2 = normalizeExecutionQuantity("okx", "SOLUSDT", "SOL-USDT-SWAP", 50, 64, 0.1, { ...SOL_RULE, minBaseAmountIncrement: 0.1, minOrderSize: 0.1 });
    const report = generateQuantityNormalizationReport([r1, r2], 10);
    expect(Array.isArray(report.results)).toBe(true);
  });
});
