/**
 * Order Adapter Interface — Live Phase 1
 *
 * Each exchange adapter implements this contract for creating,
 * cancelling, and querying orders.
 */

import type { UnifiedOrder, UnifiedOrderRequest } from "../orderRouterTypes";

export type OrderAdapter = {
  /** Exchange name this adapter targets. */
  readonly exchangeName: string;

  /**
   * Submit a new order.
   * Returns the created UnifiedOrder on success.
   * Throws on failure.
   */
  createOrder(request: UnifiedOrderRequest): Promise<UnifiedOrder>;

  /**
   * Cancel an open order.
   * Returns the cancelled UnifiedOrder on success.
   * Throws on failure.
   */
  cancelOrder(orderId: string, symbol: string): Promise<UnifiedOrder>;

  /**
   * Get the current state of an order.
   * Returns the UnifiedOrder on success.
   * Throws on failure.
   */
  getOrder(orderId: string, symbol: string): Promise<UnifiedOrder>;
};
