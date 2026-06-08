/**
 * Mock Bybit Adapter — Beta Phase 2
 *
 * Returns realistic mock data for testing the account sync engine.
 * No real API calls.
 */

import type { AccountBalance, AccountOrder, AccountPosition } from "../accountSyncTypes";
import type { AccountSyncAdapter } from "./AccountSyncAdapter";

const EXCHANGE = "bybit";

export class MockBybitAdapter implements AccountSyncAdapter {
  readonly exchangeName = EXCHANGE;

  async getBalances(): Promise<AccountBalance[]> {
    const now = Date.now();
    return [
      { exchange: EXCHANGE, asset: "USDT", total: 5_000, available: 4_500, locked: 500, updatedAt: now },
    ];
  }

  async getPositions(): Promise<AccountPosition[]> {
    const now = Date.now();
    return [
      {
        exchange: EXCHANGE,
        symbol: "ETHUSDT",
        side: "long",
        quantity: 2,
        entryPrice: 3_000,
        markPrice: 3_100,
        unrealizedPnl: 200,
        leverage: 3,
        marginMode: "isolated",
        updatedAt: now,
      },
    ];
  }

  async getOrders(): Promise<AccountOrder[]> {
    const now = Date.now();
    return [
      {
        exchange: EXCHANGE,
        orderId: "bybit-order-001",
        symbol: "ETHUSDT",
        side: "buy",
        type: "limit",
        status: "filled",
        quantity: 1,
        price: 3_050,
        createdAt: now - 7200_000,
        updatedAt: now - 3600_000,
      },
    ];
  }
}
