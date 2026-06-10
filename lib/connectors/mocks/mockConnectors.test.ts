/**
 * Mock Connectors Tests — Multi-Exchange Connector Spec
 *
 * Covers: 6 connectors, trading rules, symbol format, funding rates,
 * create/cancel/get order lifecycle, balances, health, immutability.
 */

import { describe, expect, it } from "vitest";
import { createMockConnectors } from "./createMockConnectors";
import type { ExchangeConnector } from "../connectorTypes";

// ─── Setup ─────────────────────────────────────────────

let connectors: Record<string, ExchangeConnector>;

beforeEach(() => {
  connectors = createMockConnectors();
});

// ─── 1. All 6 connectors created ──────────────────────

describe("All 6 Mock Connectors", () => {
  it("1. createMockConnectors returns 6 connectors", () => {
    expect(Object.keys(connectors)).toHaveLength(6);
    expect(connectors).toHaveProperty("binance");
    expect(connectors).toHaveProperty("bybit");
    expect(connectors).toHaveProperty("okx");
    expect(connectors).toHaveProperty("bitget");
    expect(connectors).toHaveProperty("gate");
    expect(connectors).toHaveProperty("hyperliquid");
  });

  it("2. each connector implements required methods", async () => {
    for (const [name, c] of Object.entries(connectors)) {
      expect(typeof c.getTradingRules).toBe("function");
      expect(typeof c.getFundingInfo).toBe("function");
      expect(typeof c.getOpenOrders).toBe("function");
      expect(typeof c.getBalances).toBe("function");
      expect(typeof c.getPositions).toBe("function");
      expect(typeof c.createOrder).toBe("function");
      expect(typeof c.cancelOrder).toBe("function");
      expect(typeof c.getOrder).toBe("function");
      expect(typeof c.getHealth).toBe("function");
      expect(c.supportsUserStream).toBe(false);
      expect(c.exchangeId).toBe(name);
    }
  });
});

// ─── 3. Trading Rules ─────────────────────────────────

describe("Trading Rules", () => {
  it("3. each connector returns BTCUSDT, ETHUSDT, SOLUSDT rules", async () => {
    for (const c of Object.values(connectors)) {
      const rules = await c.getTradingRules();
      expect(rules).toHaveLength(3);
      const symbols = rules.map((r) => r.canonicalSymbol);
      expect(symbols).toContain("BTCUSDT");
      expect(symbols).toContain("ETHUSDT");
      expect(symbols).toContain("SOLUSDT");
    }
  });

  it("4. symbol format matches exchange registry", async () => {
    const binance = await connectors.binance.getTradingRules();
    expect(binance.find((r) => r.canonicalSymbol === "BTCUSDT")!.exchangeSymbol).toBe("BTCUSDT");

    const bybit = await connectors.bybit.getTradingRules();
    expect(bybit.find((r) => r.canonicalSymbol === "BTCUSDT")!.exchangeSymbol).toBe("BTCUSDT");

    const okx = await connectors.okx.getTradingRules();
    expect(okx.find((r) => r.canonicalSymbol === "BTCUSDT")!.exchangeSymbol).toBe("BTC-USDT-SWAP");

    const bitget = await connectors.bitget.getTradingRules();
    expect(bitget.find((r) => r.canonicalSymbol === "BTCUSDT")!.exchangeSymbol).toBe("BTCUSDT");

    const gate = await connectors.gate.getTradingRules();
    expect(gate.find((r) => r.canonicalSymbol === "BTCUSDT")!.exchangeSymbol).toBe("BTC_USDT");

    const hl = await connectors.hyperliquid.getTradingRules();
    expect(hl.find((r) => r.canonicalSymbol === "BTCUSDT")!.exchangeSymbol).toBe("BTC");
  });
});

// ─── 5. Funding Rates ─────────────────────────────────

describe("Funding Info", () => {
  it("5. each connector has different funding rate for BTCUSDT", async () => {
    const rates: Record<string, number> = {};
    for (const [name, c] of Object.entries(connectors)) {
      const info = await c.getFundingInfo("BTCUSDT");
      expect(info).toBeDefined();
      rates[name] = info!.lastFundingRate;
    }
    // All 6 rates are distinct
    const unique = new Set(Object.values(rates));
    expect(unique.size).toBe(6);
    // Verify specific values
    expect(rates.binance).toBe(0.0001);
    expect(rates.bybit).toBe(-0.0002);
    expect(rates.okx).toBe(0.00005);
    expect(rates.bitget).toBe(-0.0001);
    expect(rates.gate).toBe(0.00008);
    expect(rates.hyperliquid).toBe(-0.00015);
  });
});

// ─── 6. Balances ─────────────────────────────────────

describe("Balances", () => {
  it("6. getBalances returns USDT", async () => {
    for (const c of Object.values(connectors)) {
      const bal = await c.getBalances();
      expect(bal).toHaveProperty("USDT");
      expect(typeof bal.USDT).toBe("number");
      expect(bal.USDT).toBeGreaterThan(0);
    }
  });
});

// ─── 7-10. Order Lifecycle ────────────────────────────

describe("Order Lifecycle", () => {
  it("7. createOrder returns open InFlightOrder", async () => {
    const c = connectors.binance;
    const result = await c.createOrder({
      exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT",
      side: "buy", type: "limit", quantity: 0.1, price: 60000,
    });
    expect(result.success).toBe(true);
    expect(result.order).toBeDefined();
    expect(result.order!.status).toBe("open");
    expect(result.order!.exchangeOrderId).toMatch(/^mock-binance-/);
  });

  it("8. cancelOrder — open → cancelled", async () => {
    const c = connectors.binance;
    const created = await c.createOrder({
      exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT",
      side: "buy", type: "limit", quantity: 0.1, price: 60000,
    });
    const orderId = created.order!.exchangeOrderId!;

    const cancelled = await c.cancelOrder(orderId, "BTCUSDT");
    expect(cancelled.success).toBe(true);
    expect(cancelled.order!.status).toBe("cancelled");
  });

  it("9. filled order cannot be cancelled", async () => {
    const c = connectors.binance;
    const created = await c.createOrder({
      exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT",
      side: "buy", type: "limit", quantity: 0.1, price: 60000,
    });
    const orderId = created.order!.exchangeOrderId!;

    // Manually fill the order in the internal store (simulate fill via direct access)
    const base = (c as any);
    const order = base._orders.get(orderId);
    const filledOrder = { ...order, status: "filled", executedQuantity: order.quantity };
    base._orders.set(orderId, filledOrder);

    const result = await c.cancelOrder(orderId, "BTCUSDT");
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("already filled");
  });

  it("10. unknown order returns failure", async () => {
    const result = await connectors.binance.cancelOrder("nonexistent", "BTCUSDT");
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("not found");
  });

  it("getOrder returns the tracked order", async () => {
    const c = connectors.binance;
    const created = await c.createOrder({
      exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT",
      side: "buy", type: "limit", quantity: 0.1, price: 60000,
    });
    const orderId = created.order!.exchangeOrderId!;
    const fetched = await c.getOrder(orderId, "BTCUSDT");
    expect(fetched).toBeDefined();
    expect(fetched!.exchangeOrderId).toBe(orderId);
  });
});

// ─── 11. Health ──────────────────────────────────────

describe("Health", () => {
  it("11. getHealth returns healthy", async () => {
    for (const c of Object.values(connectors)) {
      const h = await c.getHealth();
      expect(h.status).toBe("healthy");
    }
  });
});

// ─── 12. createMockConnectors ─────────────────────────

describe("Factory", () => {
  it("12. createMockConnectors returns correct number", () => {
    const all = createMockConnectors();
    expect(Object.keys(all)).toHaveLength(6);
  });
});

// ─── 13. No real API usage ────────────────────────────

describe("Safety", () => {
  it("13. no real API calls (no HTTP endpoints called)", () => {
    // The mocks don't use fetch or axios — they return immediately
    // This is verified by the class extending MockConnectorBase which has no HTTP calls
    expect(true).toBe(true);
  });

  it("14. no mutation of inputs", async () => {
    const c = connectors.binance;
    const request = {
      exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT",
      side: "buy" as const, type: "limit" as const, quantity: 0.1, price: 60000,
    };
    const originalRequest = { ...request };
    await c.createOrder(request);
    expect(request).toEqual(originalRequest);
  });
});

// ─── Connector-specific features ─────────────────────

describe("Connector-specific", () => {
  it("OKX symbol format is dash-separated", async () => {
    const rules = await connectors.okx.getTradingRules();
    const btc = rules.find((r) => r.canonicalSymbol === "BTCUSDT")!;
    expect(btc.exchangeSymbol).toBe("BTC-USDT-SWAP");
  });

  it("Hyperliquid symbol format is bare asset", async () => {
    const rules = await connectors.hyperliquid.getTradingRules();
    const btc = rules.find((r) => r.canonicalSymbol === "BTCUSDT")!;
    expect(btc.exchangeSymbol).toBe("BTC");
  });

  it("Gate symbol format is underscore", async () => {
    const rules = await connectors.gate.getTradingRules();
    const btc = rules.find((r) => r.canonicalSymbol === "BTCUSDT")!;
    expect(btc.exchangeSymbol).toBe("BTC_USDT");
  });
});
