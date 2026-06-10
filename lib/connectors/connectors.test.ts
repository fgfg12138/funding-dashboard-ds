/**
 * Connectors Tests — Multi-Exchange Connector Spec
 *
 * Covers: TradingRule JSON roundtrip, InFlightOrder lifecycle,
 * Throttler, FundingInfo, ConnectorHealth, immutability.
 */

import { describe, expect, it } from "vitest";
import { toJSONTradingRule, fromJSONTradingRule } from "./tradingRule";
import {
  createInFlightOrder,
  updateWithOrderUpdate,
  updateWithTradeUpdate,
  toJSONInFlightOrder,
  fromJSONInFlightOrder,
} from "./inFlightOrder";
import type { InFlightOrder, ConnectorTradeUpdate } from "./inFlightOrder";
import { createThrottleState, evaluateThrottle, recordThrottleUsage, throttleDelayMs } from "./throttler";
import { createFundingInfo, recordFundingPayment, calculateFundingPaymentTotal } from "./fundingInfo";
import { updateConnectorHealth, createConnectorHealth } from "./connectorHealth";
import type { TradingRule } from "./tradingRule";

// ─── Test Data ─────────────────────────────────────────

const SAMPLE_TRADING_RULE: TradingRule = {
  exchangeId: "binance",
  canonicalSymbol: "BTCUSDT",
  exchangeSymbol: "BTCUSDT",
  marketType: "perpetual",
  minOrderSize: 0.001,
  maxOrderSize: 1000,
  minPriceIncrement: 0.1,
  minBaseAmountIncrement: 0.001,
  minNotional: 5,
  supportsMarketOrder: true,
  supportsLimitOrder: true,
  supportsPostOnly: true,
  supportsReduceOnly: true,
  collateralToken: "USDT",
};

// ─── 1. TradingRule ────────────────────────────────────

describe("TradingRule", () => {
  it("1. JSON roundtrip preserves all fields", () => {
    const json = toJSONTradingRule(SAMPLE_TRADING_RULE);
    const restored = fromJSONTradingRule(json);
    expect(restored).toEqual(SAMPLE_TRADING_RULE);
  });

  it("handles undefined optional fields", () => {
    const rule: TradingRule = { ...SAMPLE_TRADING_RULE, maxOrderSize: undefined, collateralToken: undefined };
    const json = toJSONTradingRule(rule);
    const restored = fromJSONTradingRule(json);
    expect(restored.maxOrderSize).toBeUndefined();
    expect(restored.collateralToken).toBeUndefined();
  });
});

// ─── 2-9. InFlightOrder ───────────────────────────────

describe("InFlightOrder", () => {
  const now = Date.now();

  it("2. createInFlightOrder — initial state is pending_create", () => {
    const order = createInFlightOrder({
      clientOrderId: "test-001",
      exchangeId: "binance",
      canonicalSymbol: "BTCUSDT",
      exchangeSymbol: "BTCUSDT",
      side: "buy",
      type: "limit",
      quantity: 0.1,
      price: 60000,
    });
    expect(order.status).toBe("pending_create");
    expect(order.executedQuantity).toBe(0);
    expect(order.cumulativeFeeUsd).toBe(0);
    expect(order.clientOrderId).toBe("test-001");
  });

  it("3. updateWithOrderUpdate — pending_create → open", () => {
    let order = createInFlightOrder({ clientOrderId: "t1", exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", side: "buy", type: "limit", quantity: 0.1, price: 60000 });
    order = updateWithOrderUpdate(order, { exchangeOrderId: "ex-001", newStatus: "open", timestamp: now + 100 });
    expect(order.status).toBe("open");
    expect(order.exchangeOrderId).toBe("ex-001");
  });

  it("4. updateWithTradeUpdate — partial fill", () => {
    let order = createInFlightOrder({ clientOrderId: "t2", exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", side: "buy", type: "limit", quantity: 1, price: 60000 });
    order = updateWithOrderUpdate(order, { exchangeOrderId: "ex-002", newStatus: "open", timestamp: now });
    order = updateWithOrderUpdate(order, { exchangeOrderId: "ex-002", newStatus: "partially_filled", timestamp: now + 100 });

    const trade: ConnectorTradeUpdate = { tradeId: "fill-1", exchangeOrderId: "ex-002", fillPrice: 60000, fillQuantity: 0.4, feeUsd: 0.24, timestamp: now + 200 };
    const processed = new Set<string>();
    const { order: updated, isNew } = updateWithTradeUpdate(order, trade, processed);
    processed.add(trade.tradeId);

    expect(updated.status).toBe("partially_filled");
    expect(updated.executedQuantity).toBe(0.4);
    expect(updated.cumulativeFeeUsd).toBe(0.24);
    expect(isNew).toBe(true);
  });

  it("5. duplicate TradeUpdate is idempotent", () => {
    let order = createInFlightOrder({ clientOrderId: "t3", exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", side: "buy", type: "limit", quantity: 1, price: 60000 });
    order = updateWithOrderUpdate(order, { exchangeOrderId: "ex-003", newStatus: "open", timestamp: now });

    const processed = new Set<string>();
    const trade: ConnectorTradeUpdate = { tradeId: "fill-dup", exchangeOrderId: "ex-003", fillPrice: 60000, fillQuantity: 0.5, feeUsd: 0.30, timestamp: now + 100 };
    const { order: r1, isNew: new1 } = updateWithTradeUpdate(order, trade, processed);
    processed.add(trade.tradeId);
    expect(new1).toBe(true);
    expect(r1.executedQuantity).toBe(0.5);

    // Same trade again
    const { order: r2, isNew: new2 } = updateWithTradeUpdate(r1, trade, processed);
    expect(new2).toBe(false);
    expect(r2.executedQuantity).toBe(0.5); // Not double-counted
  });

  it("6. full fill — status becomes filled", () => {
    let order = createInFlightOrder({ clientOrderId: "t4", exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", side: "buy", type: "limit", quantity: 1, price: 60000 });
    order = updateWithOrderUpdate(order, { exchangeOrderId: "ex-004", newStatus: "open", timestamp: now });

    const processed = new Set<string>();
    const trade: ConnectorTradeUpdate = { tradeId: "fill-full", exchangeOrderId: "ex-004", fillPrice: 60000, fillQuantity: 1, feeUsd: 0.60, timestamp: now + 100 };
    const { order: updated } = updateWithTradeUpdate(order, trade, processed);
    expect(updated.status).toBe("filled");
    expect(updated.executedQuantity).toBe(1);
  });

  it("7. cancel — pending_cancel → cancelled", () => {
    let order = createInFlightOrder({ clientOrderId: "t5", exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", side: "buy", type: "limit", quantity: 0.1, price: 60000 });
    order = updateWithOrderUpdate(order, { exchangeOrderId: "ex-005", newStatus: "open", timestamp: now });
    order = updateWithOrderUpdate(order, { exchangeOrderId: "ex-005", newStatus: "pending_cancel", timestamp: now + 50 });
    order = updateWithOrderUpdate(order, { exchangeOrderId: "ex-005", newStatus: "cancelled", timestamp: now + 100 });
    expect(order.status).toBe("cancelled");
  });

  it("8. reject — pending_create → rejected", () => {
    let order = createInFlightOrder({ clientOrderId: "t6", exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", side: "buy", type: "limit", quantity: 0.1, price: 60000 });
    order = updateWithOrderUpdate(order, { exchangeOrderId: "ex-006", newStatus: "rejected", timestamp: now + 50 });
    expect(order.status).toBe("rejected");
  });

  it("9. fromJSON restores order state", () => {
    const order = createInFlightOrder({ clientOrderId: "t7", exchangeId: "binance", canonicalSymbol: "ETHUSDT", exchangeSymbol: "ETHUSDT", side: "sell", type: "limit", quantity: 1, price: 3000 });
    const json = toJSONInFlightOrder(order);
    const restored = fromJSONInFlightOrder(json);
    expect(restored).toEqual(order);
  });
});

// ─── 10-11. Throttler ─────────────────────────────────

describe("Throttler", () => {
  it("10. evaluateThrottle — allows when under limit", () => {
    const state = createThrottleState();
    const result = evaluateThrottle(state, "/fapi/v1/order", 10, 60_000, Date.now());
    expect(result.allowed).toBe(true);
    expect(result.remainingWeight).toBe(10);
  });

  it("11. throttleDelayMs — returns 0 when under limit", () => {
    const state = createThrottleState();
    const delay = throttleDelayMs(state, "/fapi/v1/order", 10, 60_000, Date.now());
    expect(delay).toBe(0);
  });

  it("throttleDelayMs — returns > 0 when at limit", () => {
    const state = createThrottleState();
    const now = 100_000;
    // Fill the limit
    for (let i = 0; i < 10; i++) {
      recordThrottleUsage(state, "/fapi/v1/order", now - 1000 + i);
    }
    const delay = throttleDelayMs(state, "/fapi/v1/order", 10, 60_000, now);
    expect(delay).toBeGreaterThan(0);
  });

  it("recordThrottleUsage — reduces remaining weight", () => {
    const state = createThrottleState();
    recordThrottleUsage(state, "/fapi/v1/order", Date.now());
    const result = evaluateThrottle(state, "/fapi/v1/order", 10, 60_000, Date.now());
    expect(result.remainingWeight).toBe(9);
  });
});

// ─── 12-13. FundingInfo ────────────────────────────────

describe("FundingInfo", () => {
  it("12. createFundingInfo — creates with all fields", () => {
    const info = createFundingInfo({
      exchangeId: "binance",
      canonicalSymbol: "BTCUSDT",
      exchangeSymbol: "BTCUSDT",
      markPrice: 60000,
      indexPrice: 59990,
      lastFundingRate: 0.0001,
      nextFundingTime: Date.now() + 8 * 3600_000,
    });
    expect(info.markPrice).toBe(60000);
    expect(info.lastFundingRate).toBe(0.0001);
  });

  it("13. calculateFundingPaymentTotal — sums correctly", () => {
    const p1 = { exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", amountUsd: 1.5, fundingRate: 0.0001, paidAt: 1000 };
    const p2 = { exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", amountUsd: -0.5, fundingRate: 0.0002, paidAt: 2000 };
    const payments = recordFundingPayment([], p1);
    const payments2 = recordFundingPayment(payments, p2);
    expect(calculateFundingPaymentTotal(payments2)).toBe(1.0);
  });
});

// ─── 14. ConnectorHealth ──────────────────────────────

describe("ConnectorHealth", () => {
  it("14. updateConnectorHealth — updates status and latency", () => {
    const health = createConnectorHealth("binance");
    expect(health.status).toBe("healthy");

    const updated = updateConnectorHealth(health, { status: "degraded", lastRestLatencyMs: 500 });
    expect(updated.status).toBe("degraded");
    expect(updated.lastRestLatencyMs).toBe(500);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(health.updatedAt);
  });
});

// ─── 15. No mutation of inputs ────────────────────────

describe("Immutability", () => {
  it("15. createInFlightOrder does not share references with input", () => {
    const order = createInFlightOrder({ clientOrderId: "immut", exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", side: "buy", type: "limit", quantity: 0.1, price: 60000 });
    const updated = updateWithOrderUpdate(order, { exchangeOrderId: "ex-imm", newStatus: "open", timestamp: Date.now() });
    expect(order.status).toBe("pending_create"); // Original unchanged
    expect(updated.status).toBe("open");
  });
});

// ─── Additional coverage ──────────────────────────────

describe("Additional coverage", () => {
  it("partial fill from open transitions correctly", () => {
    let order = createInFlightOrder({ clientOrderId: "add1", exchangeId: "binance", canonicalSymbol: "SOLUSDT", exchangeSymbol: "SOLUSDT", side: "buy", type: "limit", quantity: 10, price: 60 });
    order = updateWithOrderUpdate(order, { exchangeOrderId: "ex-a1", newStatus: "open", timestamp: Date.now() });

    const processed = new Set<string>();
    const t1: ConnectorTradeUpdate = { tradeId: "a-fill-1", exchangeOrderId: "ex-a1", fillPrice: 60, fillQuantity: 3, feeUsd: 0.18, timestamp: Date.now() + 100 };
    const { order: r1 } = updateWithTradeUpdate(order, t1, processed);
    processed.add(t1.tradeId);
    expect(r1.status).toBe("partially_filled");

    // filled quantity clamped to order quantity
    const t2: ConnectorTradeUpdate = { tradeId: "a-fill-2", exchangeOrderId: "ex-a1", fillPrice: 60, fillQuantity: 100, feeUsd: 6, timestamp: Date.now() + 200 };
    const { order: r2 } = updateWithTradeUpdate(r1, t2, processed);
    processed.add(t2.tradeId);
    expect(r2.executedQuantity).toBe(10); // Clamped
    expect(r2.status).toBe("filled");
  });

  it("illegal status transition is rejected (filled → open)", () => {
    let order = createInFlightOrder({ clientOrderId: "illegal", exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", side: "buy", type: "limit", quantity: 1, price: 60000 });
    const processed = new Set<string>();
    order = updateWithOrderUpdate(order, { exchangeOrderId: "ex-il", newStatus: "open", timestamp: Date.now() });
    const trade: ConnectorTradeUpdate = { tradeId: "il-fill", exchangeOrderId: "ex-il", fillPrice: 60000, fillQuantity: 1, feeUsd: 0.6, timestamp: Date.now() + 100 };
    const { order: filled } = updateWithTradeUpdate(order, trade, processed);
    processed.add(trade.tradeId);
    expect(filled.status).toBe("filled");

    const afterIllegal = updateWithOrderUpdate(filled, { exchangeOrderId: "ex-il", newStatus: "open", timestamp: Date.now() + 200 });
    expect(afterIllegal.status).toBe("filled"); // stayed filled
  });
});
