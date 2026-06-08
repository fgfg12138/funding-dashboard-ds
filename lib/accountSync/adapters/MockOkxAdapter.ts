/**
 * Mock OKX Adapter — Beta Phase 2
 *
 * Returns realistic mock data for testing the account sync engine.
 * No real API calls.
 */

import type { AccountBalance, AccountOrder, AccountPosition } from "../accountSyncTypes";
import type { AccountSyncAdapter } from "./AccountSyncAdapter";

const EXCHANGE = "okx";

export class MockOkxAdapter implements AccountSyncAdapter {
  readonly exchangeName = EXCHANGE;

  async getBalances(): Promise<AccountBalance[]> {
    const now = Date.now();
    return [
      { exchange: EXCHANGE, asset: "USDT", total: 3_000, available: 3_000, locked: 0, updatedAt: now },
      { exchange: EXCHANGE, asset: "SOL", total: 50, available: 50, locked: 0, updatedAt: now },
    ];
  }

  async getPositions(): Promise<AccountPosition[]> {
    return []; // no open positions
  }

  async getOrders(): Promise<AccountOrder[]> {
    return []; // no open orders
  }
}
