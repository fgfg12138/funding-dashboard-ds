/**
 * Mock Binance Adapter — Beta Phase 2
 *
 * Returns realistic mock data for testing the account sync engine.
 * No real API calls.
 */

import type { AccountBalance, AccountOrder, AccountPosition } from "../accountSyncTypes";
import type { AccountSyncAdapter } from "./AccountSyncAdapter";

const EXCHANGE = "binance";

export class MockBinanceAdapter implements AccountSyncAdapter {
  readonly exchangeName = EXCHANGE;

  async getBalances(): Promise<AccountBalance[]> {
    const now = Date.now();
    return [
      { exchange: EXCHANGE, asset: "USDT", total: 10_000, available: 8_000, locked: 2_000, updatedAt: now },
      { exchange: EXCHANGE, asset: "BTC", total: 0.5, available: 0.5, locked: 0, updatedAt: now },
    ];
  }

  async getPositions(): Promise<AccountPosition[]> {
    const now = Date.now();
    return [
      {
        exchange: EXCHANGE,
        symbol: "BTCUSDT",
        side: "short",
        quantity: 0.1,
        entryPrice: 100_000,
        markPrice: 99_500,
        unrealizedPnl: 50,
        leverage: 1,
        marginMode: "cross",
        updatedAt: now,
      },
    ];
  }

  async getOrders(): Promise<AccountOrder[]> {
    const now = Date.now();
    return [
      {
        exchange: EXCHANGE,
        orderId: "binance-order-001",
        symbol: "BTCUSDT",
        side: "buy",
        type: "limit",
        status: "new",
        quantity: 0.01,
        price: 99_000,
        createdAt: now - 3600_000,
        updatedAt: now,
      },
    ];
  }
}
