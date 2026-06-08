import { describe, expect, it } from "vitest";
import { createMockPrivateAccountAdapter } from "./mockPrivateAccountAdapter";
import { createPrivateAccountAdapter } from "./privateAccountAdapter";

describe("mockPrivateAccountAdapter", () => {
  const adapter = createMockPrivateAccountAdapter("Binance");

  it("returns balances with expected structure", async () => {
    const balances = await adapter.getBalances();
    expect(balances.exchangeId).toBe("Binance");
    expect(balances.assets.length).toBeGreaterThan(0);
    expect(balances.assets[0].asset).toBeDefined();
    expect(balances.assets[0].free).toBeGreaterThan(0);
    expect(balances.assets[0].total).toBe(balances.assets[0].free + balances.assets[0].locked);
    expect(balances.totalUsdValue).toBeGreaterThan(0);
    expect(balances.fetchedAt).toBeGreaterThan(0);
  });

  it("returns positions", async () => {
    const positions = await adapter.getPositions();
    expect(positions.length).toBeGreaterThan(0);
    expect(positions[0].exchangeId).toBe("Binance");
    expect(positions[0].symbol).toBe("BTC/USDT");
    expect(positions[0].notionalUsd).toBeGreaterThan(0);
    expect(typeof positions[0].unrealizedPnl).toBe("number");
  });

  it("returns open orders", async () => {
    const orders = await adapter.getOpenOrders();
    expect(orders.length).toBeGreaterThan(0);
    expect(orders[0].orderId).toMatch(/^mock-/);
    expect(orders[0].status).toMatch(/^(open|partially_filled)$/);
  });

  it("returns funding payments with limit", async () => {
    const payments = await adapter.getFundingPayments(5);
    expect(payments).toHaveLength(5);
    expect(payments[0].symbol).toBe("BTC/USDT");
    expect(typeof payments[0].amountUsd).toBe("number");
    expect(typeof payments[0].fundingRate).toBe("number");
  });

  it("getSnapshot aggregates all data", async () => {
    const snapshot = await adapter.getSnapshot();
    expect(snapshot.exchangeId).toBe("Binance");
    expect(snapshot.source).toBe("mock");
    expect(snapshot.mode).toBe("mock");
    expect(snapshot.balances.assets.length).toBeGreaterThan(0);
    expect(snapshot.positions.length).toBeGreaterThan(0);
    expect(snapshot.openOrders.length).toBeGreaterThan(0);
    expect(snapshot.fundingPayments.length).toBeGreaterThan(0);
    expect(snapshot.fetchedAt).toBeGreaterThan(0);
  });

  it("does not require API Key", async () => {
    // Mock adapter should work without any credentials
    const noKeyAdapter = createMockPrivateAccountAdapter("OKX");
    const snapshot = await noKeyAdapter.getSnapshot();
    expect(snapshot.exchangeId).toBe("OKX");
  });

  it("does not make network requests", async () => {
    // Test runs in Node — no fetch was made (no network available)
    const snapshot = await adapter.getSnapshot();
    expect(snapshot.source).toBe("mock");
  });
});

describe("createPrivateAccountAdapter", () => {
  it("creates a mock adapter by default", () => {
    const adapter = createPrivateAccountAdapter("OKX");
    expect(adapter.mode).toBe("mock");
    expect(adapter.exchangeId).toBe("OKX");
  });

  it("creates a mock adapter for 'mock' mode", () => {
    const adapter = createPrivateAccountAdapter("Bybit", "mock");
    expect(adapter.mode).toBe("mock");
  });

  it("throws for 'live-disabled' mode", () => {
    expect(() => createPrivateAccountAdapter("Binance", "live-disabled")).toThrow("not yet available");
  });
});
