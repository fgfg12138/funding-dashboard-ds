/**
 * Mock Connector Base — Multi-Exchange Connector Spec
 *
 * Base class for all mock exchange connectors.
 * No real API calls — simulated in-memory order tracking.
 */

import type { ExchangeConnector, ConnectorOrderRequest, ConnectorOrderResult, OrderSide, OrderType } from "../connectorTypes";
import type { TradingRule } from "../tradingRule";
import type { FundingInfo } from "../fundingInfo";
import type { InFlightOrder, InFlightOrderStatus } from "../inFlightOrder";
import { createInFlightOrder, updateWithOrderUpdate, toJSONInFlightOrder, fromJSONInFlightOrder } from "../inFlightOrder";
import type { ConnectorHealth } from "../connectorHealth";
import { createConnectorHealth } from "../connectorHealth";

// ─── Type for position update events ──────────────────

export type MockPosition = {
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
};

// ─── Base Class ───────────────────────────────────────

export abstract class MockConnectorBase implements ExchangeConnector {
  abstract readonly exchangeId: string;
  readonly supportsUserStream = false;

  // Abstract: each exchange provides its own symbol format and funding rates
  protected abstract getExchangeSymbol(canonical: string): string;
  protected abstract getFundingRate(canonical: string): number;

  // In-memory store
  protected _orders: Map<string, InFlightOrder> = new Map();
  protected _seq = 0;
  protected _health!: ConnectorHealth;
  protected _balances: Record<string, number> = { USDT: 10000 };

  constructor() {
    // Use setTimeout to defer health creation (avoids abstract property access in constructor)
    // or we could just let each subclass pass exchangeId. But since exchangeId is defined as
    // abstract readonly, the value IS available by the time methods are called, just not in the
    // constructor body of the base class. So we lazily initialize _health.
  }

  private ensureHealth(): ConnectorHealth {
    if (!this._health) {
      this._health = createConnectorHealth(this.exchangeId);
    }
    return this._health;
  }

  // ── Connection ───────────────────────────────────

  async connect(): Promise<void> { /* no-op */ }
  async disconnect(): Promise<void> { /* no-op */ }

  // ── Trading Rules ────────────────────────────────

  async getTradingRules(): Promise<TradingRule[]> {
    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
    return symbols.map((sym) => ({
      exchangeId: this.exchangeId,
      canonicalSymbol: sym,
      exchangeSymbol: this.getExchangeSymbol(sym),
      marketType: "perpetual" as const,
      minOrderSize: 0.001,
      maxOrderSize: 1000,
      minPriceIncrement: 0.01,
      minBaseAmountIncrement: 0.001,
      minNotional: 5,
      supportsMarketOrder: true,
      supportsLimitOrder: true,
      supportsPostOnly: true,
      supportsReduceOnly: true,
      collateralToken: "USDT",
    }));
  }

  // ── Funding Info ────────────────────────────────

  async getFundingInfo(canonicalSymbol: string): Promise<FundingInfo | undefined> {
    const rate = this.getFundingRate(canonicalSymbol);
    if (rate === undefined) return undefined;
    return {
      exchangeId: this.exchangeId,
      canonicalSymbol,
      exchangeSymbol: this.getExchangeSymbol(canonicalSymbol),
      markPrice: 60000,
      indexPrice: 59990,
      lastFundingRate: rate,
      nextFundingTime: Date.now() + 8 * 3600_000,
    };
  }

  // ── Orders ──────────────────────────────────────

  async getOpenOrders(): Promise<InFlightOrder[]> {
    return Array.from(this._orders.values()).filter((o) =>
      o.status === "pending_create" || o.status === "open" || o.status === "partially_filled" || o.status === "pending_cancel",
    );
  }

  async createOrder(request: ConnectorOrderRequest): Promise<ConnectorOrderResult> {
    this._seq++;
    const clientOrderId = request.clientOrderId ?? `mock-${this.exchangeId}-${String(this._seq).padStart(6, "0")}`;
    const exchangeOrderId = `mock-${this.exchangeId}-${clientOrderId}`;

    const order = createInFlightOrder({
      clientOrderId,
      exchangeId: this.exchangeId,
      canonicalSymbol: request.canonicalSymbol,
      exchangeSymbol: request.exchangeSymbol || this.getExchangeSymbol(request.canonicalSymbol),
      side: request.side,
      type: request.type,
      quantity: request.quantity,
      price: request.price,
    });

    // Acknowledge immediately: pending_create → open
    const updated = updateWithOrderUpdate(order, {
      exchangeOrderId,
      newStatus: "open",
      timestamp: Date.now(),
    });

    this._orders.set(exchangeOrderId, updated);
    this._orders.set(clientOrderId, updated);

    return { success: true, order: updated, errors: [] };
  }

  async cancelOrder(orderId: string, _canonicalSymbol: string): Promise<ConnectorOrderResult> {
    const order = this._orders.get(orderId);
    if (!order) {
      return { success: false, errors: [`Order not found: ${orderId}`] };
    }

    if (order.status === "filled") {
      return { success: false, errors: [`Order ${orderId} is already filled — cannot cancel`] };
    }

    if (order.status === "cancelled") {
      return { success: false, errors: [`Order ${orderId} is already cancelled`] };
    }

    const cancelled = updateWithOrderUpdate(order, {
      exchangeOrderId: order.exchangeOrderId!,
      newStatus: "pending_cancel",
      timestamp: Date.now(),
    });
    const finalCancelled = updateWithOrderUpdate(cancelled, {
      exchangeOrderId: order.exchangeOrderId!,
      newStatus: "cancelled",
      timestamp: Date.now() + 10,
    });

    this._orders.set(orderId, finalCancelled);
    if (finalCancelled.exchangeOrderId) this._orders.set(finalCancelled.exchangeOrderId, finalCancelled);

    return { success: true, order: finalCancelled, errors: [] };
  }

  async getOrder(orderId: string, _canonicalSymbol: string): Promise<InFlightOrder | undefined> {
    return this._orders.get(orderId);
  }

  // ── Balances / Positions ─────────────────────────

  async getBalances(): Promise<Record<string, number>> {
    return { ...this._balances };
  }

  async getPositions(): Promise<MockPosition[]> {
    return [];
  }

  // ── Health ──────────────────────────────────────

  async getHealth(): Promise<ConnectorHealth> {
    return { ...this.ensureHealth() };
  }

  // ── Utility for tracking filled orders (used in tests) ──

  protected trackOrder(order: InFlightOrder): void {
    const key = order.exchangeOrderId ?? order.clientOrderId;
    this._orders.set(key, order);
  }
}
