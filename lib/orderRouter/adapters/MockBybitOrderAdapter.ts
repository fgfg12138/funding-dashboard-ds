/**
 * Mock Bybit Order Adapter — Live Phase 1
 *
 * Returns simulated order states. No real API calls.
 */

import type { UnifiedOrder, UnifiedOrderRequest } from "../orderRouterTypes";
import type { OrderAdapter } from "./OrderAdapter";

const EXCHANGE = "bybit";

let _seq = 0;
function nextId(): string {
  _seq += 1;
  return `${EXCHANGE}-${String(_seq).padStart(8, "0")}`;
}

export class MockBybitOrderAdapter implements OrderAdapter {
  readonly exchangeName = EXCHANGE;

  async createOrder(request: UnifiedOrderRequest): Promise<UnifiedOrder> {
    const now = Date.now();
    return {
      exchange: EXCHANGE,
      orderId: nextId(),
      clientOrderId: request.clientOrderId,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      quantity: request.quantity,
      filledQuantity: 0,
      price: request.price,
      status: "open",
      createdAt: now,
      updatedAt: now,
    };
  }

  async cancelOrder(orderId: string, symbol: string): Promise<UnifiedOrder> {
    const now = Date.now();
    return {
      exchange: EXCHANGE,
      orderId,
      symbol,
      side: "buy",
      type: "limit",
      quantity: 0,
      filledQuantity: 0,
      status: "cancelled",
      createdAt: now - 60_000,
      updatedAt: now,
    };
  }

  async getOrder(orderId: string, symbol: string): Promise<UnifiedOrder> {
    const now = Date.now();
    return {
      exchange: EXCHANGE,
      orderId,
      symbol,
      side: "buy",
      type: "limit",
      quantity: 0.1,
      filledQuantity: 0,
      status: "open",
      createdAt: now - 60_000,
      updatedAt: now,
    };
  }
}
