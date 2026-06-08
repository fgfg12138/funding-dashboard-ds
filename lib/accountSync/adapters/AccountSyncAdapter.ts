/**
 * Account Sync Adapter Interface — Beta Phase 2
 *
 * Defines the contract each exchange adapter must implement
 * for reading account data (balances, positions, orders).
 *
 * All methods are read-only. No write operations.
 */

import type { AccountBalance, AccountOrder, AccountPosition } from "../accountSyncTypes";

export type AccountSyncAdapter = {
  /** Exchange name this adapter targets. */
  readonly exchangeName: string;

  /**
   * Fetch current balances for all assets.
   * Returns an empty array if the exchange does not support balance queries
   * with the given credentials.
   */
  getBalances(): Promise<AccountBalance[]>;

  /**
   * Fetch current open positions.
   * Returns an empty array if there are no positions or the exchange
   * does not support position queries.
   */
  getPositions(): Promise<AccountPosition[]>;

  /**
   * Fetch current open / recent orders.
   * Returns an empty array if there are no orders.
   */
  getOrders(): Promise<AccountOrder[]>;
};
