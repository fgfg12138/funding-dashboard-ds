/**
 * Order Router Tests — Live Phase 1
 *
 * Acceptance criteria:
 *   exchange=binance, symbol=BTCUSDT, side=buy, type=market, quantity=0.1
 *   → success=true, order.exchange=binance, order.symbol=BTCUSDT,
 *     order.side=buy, order.type=market, order.quantity=0.1, order.status=open
 */

import { describe, expect, it } from "vitest";
import {
  cancelOrder,
  createOrder,
  getAdapter,
  getOrder,
  registerAdapter,
} from "./orderRouter";
import type { OrderAdapter } from "./adapters/OrderAdapter";
import type { UnifiedOrderRequest } from "./orderRouterTypes";

// ─── Helpers ─────────────────────────────────────────────

function req(overrides?: Partial<UnifiedOrderRequest>): UnifiedOrderRequest {
  return {
    exchange: "binance",
    symbol: "BTCUSDT",
    side: "buy",
    type: "market",
    quantity: 0.1,
    ...overrides,
  };
}

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  it("Binance market buy 0.1 BTCUSDT → success, order fields match", async () => {
    const result = await createOrder(req());

    expect(result.success).toBe(true);
    expect(result.order).toBeDefined();
    expect(result.errors).toEqual([]);

    const order = result.order!;
    expect(order.exchange).toBe("binance");
    expect(order.symbol).toBe("BTCUSDT");
    expect(order.side).toBe("buy");
    expect(order.type).toBe("market");
    expect(order.quantity).toBe(0.1);
    expect(order.status).toBe("open");
  });
});

// ─── createOrder ───────────────────────────────────────

describe("createOrder", () => {
  it("Binance creates order successfully", async () => {
    const result = await createOrder(req({ exchange: "binance" }));
    expect(result.success).toBe(true);
    expect(result.order!.orderId).toMatch(/^binance-/);
  });

  it("Bybit creates order successfully", async () => {
    const result = await createOrder(req({ exchange: "bybit" }));
    expect(result.success).toBe(true);
    expect(result.order!.orderId).toMatch(/^bybit-/);
  });

  it("OKX creates order successfully", async () => {
    const result = await createOrder(req({ exchange: "okx" }));
    expect(result.success).toBe(true);
    expect(result.order!.orderId).toMatch(/^okx-/);
  });

  it("all exchanges return unified format", async () => {
    for (const exchange of ["binance", "bybit", "okx"] as const) {
      const result = await createOrder(req({ exchange }));
      expect(result.success).toBe(true);
      const o = result.order!;
      expect(o.exchange).toBe(exchange);
      expect(o.symbol).toBe("BTCUSDT");
      expect(["buy", "sell"]).toContain(o.side);
      expect(["market", "limit"]).toContain(o.type);
      expect(o.quantity).toBeGreaterThan(0);
      expect(o.status).toBe("open");
      expect(typeof o.createdAt).toBe("number");
      expect(typeof o.updatedAt).toBe("number");
    }
  });
});

// ─── cancelOrder ─────────────────────────────────────

describe("cancelOrder", () => {
  it("cancels an order and returns cancelled status", async () => {
    const result = await cancelOrder("binance", "binance-00000001", "BTCUSDT");
    expect(result.success).toBe(true);
    expect(result.order!.status).toBe("cancelled");
  });
});

// ─── getOrder ───────────────────────────────────────

describe("getOrder", () => {
  it("returns the current order state", async () => {
    const result = await getOrder("binance", "binance-00000001", "BTCUSDT");
    expect(result.success).toBe(true);
    expect(result.order!.orderId).toBe("binance-00000001");
    expect(result.order!.status).toBe("open");
  });
});

// ─── getAdapter ────────────────────────────────────

describe("getAdapter", () => {
  it("returns adapter for binance", () => {
    const adapter = getAdapter("binance");
    expect(adapter.exchangeName).toBe("binance");
  });

  it("returns adapter for bybit", () => {
    const adapter = getAdapter("bybit");
    expect(adapter.exchangeName).toBe("bybit");
  });

  it("returns adapter for okx", () => {
    const adapter = getAdapter("okx");
    expect(adapter.exchangeName).toBe("okx");
  });

  it("throws for unknown exchange", () => {
    expect(() => getAdapter("unknown" as any)).toThrow("Unsupported exchange");
  });
});

// ─── registerAdapter ────────────────────────────────

describe("registerAdapter", () => {
  it("allows runtime adapter replacement", () => {
    const mockAdapter: OrderAdapter = {
      exchangeName: "test",
      createOrder: async () => { throw new Error("custom error"); },
      cancelOrder: async () => { throw new Error("custom error"); },
      getOrder: async () => { throw new Error("custom error"); },
    };

    registerAdapter("test", mockAdapter);
    const adapter = getAdapter("test");
    expect(adapter.exchangeName).toBe("test");
  });
});

// ─── Error Handling ────────────────────────────────

describe("error handling", () => {
  it("createOrder returns errors without throwing", async () => {
    // Register a failing adapter
    const failingAdapter: OrderAdapter = {
      exchangeName: "failing",
      createOrder: async () => { throw new Error("API timeout"); },
      cancelOrder: async () => { throw new Error("API timeout"); },
      getOrder: async () => { throw new Error("API timeout"); },
    };
    registerAdapter("failing", failingAdapter);

    const result = await createOrder(req({ exchange: "failing" }));
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("API timeout");
  });

  it("unknown exchange returns error without throwing", async () => {
    const result = await createOrder(req({ exchange: "nonexistent" as any }));
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ─── Immutability ─────────────────────────────────

describe("immutability", () => {
  it("does not mutate the request", async () => {
    const request = req();
    const originalQty = request.quantity;
    await createOrder(request);
    expect(request.quantity).toBe(originalQty);
  });
});
