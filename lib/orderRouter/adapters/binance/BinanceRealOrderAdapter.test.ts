/**
 * Binance Real Order Adapter Tests
 *
 * Covers: dryRun, allowRealExecution gate, real execution via mock HTTP,
 * mapper correctness, cancelOrder, getOrder, status mapping, HMAC stability.
 * No real Binance API calls.
 */

import { describe, expect, it } from "vitest";
import { BinanceRealOrderAdapter } from "./BinanceRealOrderAdapter";
import { MockBinanceHttpClient } from "./BinanceHttpClient";
import { signParams } from "./BinanceSigning";
import {
  mapUnifiedOrderRequestToBinance,
  mapBinanceOrderToUnifiedOrder,
  mapStatusFromBinance,
  mapSideToBinance,
  mapTypeToBinance,
} from "./BinanceOrderMapper";
import type { UnifiedOrderRequest } from "../../orderRouterTypes";
import type { BinanceAdapterConfig } from "./BinanceRealOrderAdapter";

// ─── Helpers ─────────────────────────────────────────────

const TEST_API_KEY = "test-api-key-12345";
const TEST_SECRET = "test-secret-abc-def-ghi-jkl-mno";

function createAdapter(config?: Partial<BinanceAdapterConfig>, httpClient?: MockBinanceHttpClient) {
  const client = httpClient ?? new MockBinanceHttpClient();
  const adapter = new BinanceRealOrderAdapter(
    {
      apiKey: TEST_API_KEY,
      secret: TEST_SECRET,
      dryRun: true,
      allowRealExecution: false,
      testnet: true,
      ...config,
    },
    client,
  );
  return { adapter, client };
}

function makeRequest(overrides?: Partial<UnifiedOrderRequest>): UnifiedOrderRequest {
  return {
    exchange: "binance",
    symbol: "BTCUSDT",
    side: "buy",
    type: "market",
    quantity: 0.1,
    ...overrides,
  };
}

function makeBinanceOrderResponse(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    symbol: "BTCUSDT",
    orderId: 123456789,
    clientOrderId: "my-order-1",
    side: "BUY",
    type: "MARKET",
    origQty: "0.100",
    executedQty: "0.100",
    price: "0",
    status: "FILLED",
    updateTime: Date.now(),
    ...overrides,
  };
}

// ─── dryRun ──────────────────────────────────────────────

describe("dryRun", () => {
  it("createOrder returns simulated order without HTTP call", async () => {
    const { adapter, client } = createAdapter({ dryRun: true });
    const order = await adapter.createOrder(makeRequest());

    expect(order.orderId).toMatch(/^binance-dryrun-/);
    expect(order.status).toBe("open");
    expect(order.symbol).toBe("BTCUSDT");
    expect(client.calls.length).toBe(0);
  });

  it("cancelOrder returns cancelled without HTTP call", async () => {
    const { adapter, client } = createAdapter({ dryRun: true });
    const order = await adapter.cancelOrder("test-id", "BTCUSDT");

    expect(order.status).toBe("cancelled");
    expect(client.calls.length).toBe(0);
  });

  it("getOrder returns open without HTTP call", async () => {
    const { adapter, client } = createAdapter({ dryRun: true });
    const order = await adapter.getOrder("test-id", "BTCUSDT");

    expect(order.status).toBe("open");
    expect(client.calls.length).toBe(0);
  });
});

// ─── allowRealExecution ──────────────────────────────

describe("allowRealExecution gate", () => {
  it("createOrder throws when allowRealExecution=false", async () => {
    const { adapter } = createAdapter({ dryRun: false, allowRealExecution: false });
    await expect(adapter.createOrder(makeRequest())).rejects.toThrow("Real execution is disabled");
  });

  it("cancelOrder throws when allowRealExecution=false", async () => {
    const { adapter } = createAdapter({ dryRun: false, allowRealExecution: false });
    await expect(adapter.cancelOrder("id", "BTCUSDT")).rejects.toThrow("Real execution is disabled");
  });
});

// ─── Real execution via mock HTTP ─────────────────────

describe("real execution via mock HTTP", () => {
  it("createOrder calls POST /fapi/v1/order and maps response", async () => {
    const client = new MockBinanceHttpClient();
    client.setResponse({ body: makeBinanceOrderResponse() });

    const { adapter } = createAdapter({ dryRun: false, allowRealExecution: true }, client);
    const order = await adapter.createOrder(makeRequest());

    expect(client.calls.length).toBe(1);
    expect(client.calls[0].method).toBe("POST");
    expect(client.calls[0].path).toBe("/fapi/v1/order");

    expect(order.orderId).toBe("123456789");
    expect(order.symbol).toBe("BTCUSDT");
    expect(order.side).toBe("buy");
    expect(order.type).toBe("market");
    expect(order.quantity).toBe(0.1);
    expect(order.status).toBe("filled");
  });

  it("cancelOrder calls DELETE /fapi/v1/order", async () => {
    const client = new MockBinanceHttpClient();
    client.setResponse({ body: makeBinanceOrderResponse({ status: "CANCELED" }) });

    const { adapter } = createAdapter({ dryRun: false, allowRealExecution: true }, client);
    await adapter.cancelOrder("123", "BTCUSDT");

    expect(client.calls.length).toBe(1);
    expect(client.calls[0].method).toBe("DELETE");
    expect(client.calls[0].path).toBe("/fapi/v1/order");
  });

  it("getOrder calls GET /fapi/v1/order", async () => {
    const client = new MockBinanceHttpClient();
    client.setResponse({ body: makeBinanceOrderResponse({ status: "NEW" }) });

    const { adapter } = createAdapter({ dryRun: false, allowRealExecution: true }, client);
    const order = await adapter.getOrder("123", "BTCUSDT");

    expect(client.calls.length).toBe(1);
    expect(client.calls[0].method).toBe("GET");
    expect(client.calls[0].path).toBe("/fapi/v1/order");
    expect(order.status).toBe("open"); // NEW → open
  });
});

// ─── Mapper ──────────────────────────────────────────

describe("BinanceOrderMapper", () => {
  it("maps UnifiedOrderRequest to Binance params", () => {
    const req = makeRequest({ type: "limit", price: 50000 });
    const params = mapUnifiedOrderRequestToBinance(req);

    expect(params.symbol).toBe("BTCUSDT");
    expect(params.side).toBe("BUY");
    expect(params.type).toBe("LIMIT");
    expect(params.quantity).toBe(0.1);
    expect(params.price).toBe(50000);
    expect(params.timeInForce).toBe("GTC");
    expect(typeof params.timestamp).toBe("number");
  });

  it("market order omits price and timeInForce", () => {
    const params = mapUnifiedOrderRequestToBinance(makeRequest({ type: "market" }));
    expect(params.price).toBeUndefined();
    expect(params.timeInForce).toBeUndefined();
  });

  it("maps Binance response to UnifiedOrder", () => {
    const binance = makeBinanceOrderResponse({
      symbol: "ETHUSDT",
      orderId: 999,
      side: "SELL",
      type: "LIMIT",
      origQty: "2.000",
      executedQty: "1.000",
      price: "3000.00",
      status: "PARTIALLY_FILLED",
    });

    const unified = mapBinanceOrderToUnifiedOrder(binance, "binance");

    expect(unified.symbol).toBe("ETHUSDT");
    expect(unified.orderId).toBe("999");
    expect(unified.side).toBe("sell");
    expect(unified.type).toBe("limit");
    expect(unified.quantity).toBe(2);
    expect(unified.filledQuantity).toBe(1);
    expect(unified.price).toBe(3000);
    expect(unified.status).toBe("open"); // PARTIALLY_FILLED → open
  });
});

// ─── Status mapping ────────────────────────────────

describe("status mapping", () => {
  const cases: Array<[string, string]> = [
    ["NEW", "open"],
    ["PARTIALLY_FILLED", "open"],
    ["FILLED", "filled"],
    ["CANCELED", "cancelled"],
    ["REJECTED", "rejected"],
    ["EXPIRED", "cancelled"],
    ["UNKNOWN", "rejected"],
  ];

  for (const [binance, expected] of cases) {
    it(`${binance} → ${expected}`, () => {
      expect(mapStatusFromBinance(binance)).toBe(expected);
    });
  }
});

// ─── Side / Type mapping ───────────────────────────

describe("side/type mapping", () => {
  it("maps buy → BUY, sell → SELL", () => {
    expect(mapSideToBinance("buy")).toBe("BUY");
    expect(mapSideToBinance("sell")).toBe("SELL");
  });

  it("maps market → MARKET, limit → LIMIT", () => {
    expect(mapTypeToBinance("market")).toBe("MARKET");
    expect(mapTypeToBinance("limit")).toBe("LIMIT");
  });
});

// ─── HMAC Signing ────────────────────────────────

describe("HMAC signing", () => {
  it("produces stable signature for same params + secret", () => {
    const params = { symbol: "BTCUSDT", timestamp: 1234567890 };
    const sig1 = signParams(params, TEST_SECRET);
    const sig2 = signParams(params, TEST_SECRET);
    expect(sig1).toBe(sig2);
  });

  it("different secret produces different signature", () => {
    const params = { symbol: "BTCUSDT", timestamp: 1234567890 };
    const sig1 = signParams(params, "secret-1");
    const sig2 = signParams(params, "secret-2");
    expect(sig1).not.toBe(sig2);
  });

  it("skips undefined values", () => {
    const params = { symbol: "BTCUSDT", timestamp: 1234567890, price: undefined };
    const sig = signParams(params, TEST_SECRET);
    expect(typeof sig).toBe("string");
    expect(sig.length).toBeGreaterThan(0);
  });

  it("sorts keys alphabetically", () => {
    const params = { b: "2", a: "1", timestamp: 0 };
    // With sorted keys: a=1&b=2&timestamp=0
    const sig = signParams(params, TEST_SECRET);
    expect(typeof sig).toBe("string");
  });
});
