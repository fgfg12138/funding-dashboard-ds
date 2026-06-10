/**
 * Connector Types — Multi-Exchange Connector Spec
 *
 * Defines the abstract ExchangeConnector interface and shared enums.
 * No real API calls — pure interfaces.
 */

import type { TradingRule } from "./tradingRule";
import type { FundingInfo } from "./fundingInfo";
import type { InFlightOrder } from "./inFlightOrder";
import type { ConnectorHealth } from "./connectorHealth";

// ─── Order Primitives ─────────────────────────────────

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";
export type ConnectorStatus = "connected" | "disconnected" | "error";

// ─── Unified Order Request / Result ───────────────────

export type ConnectorOrderRequest = {
  exchangeId: string;
  canonicalSymbol: string;
  exchangeSymbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  timeInForce?: "GTC" | "IOC" | "FOK";
  clientOrderId?: string;
};

export type ConnectorOrderResult = {
  success: boolean;
  order?: InFlightOrder;
  errors: string[];
};

// ─── Exchange Connector Interface ─────────────────────

export interface ExchangeConnector {
  /** Exchange identifier (e.g. "binance", "bybit"). */
  readonly exchangeId: string;

  /** Whether WebSocket user stream is supported. */
  readonly supportsUserStream: boolean;

  /** Connect to the exchange (REST + optional WS). */
  connect(): Promise<void>;

  /** Disconnect and clean up. */
  disconnect(): Promise<void>;

  /** Get trading rules for all configured symbols. */
  getTradingRules(): Promise<TradingRule[]>;

  /** Get funding info for a symbol. */
  getFundingInfo(canonicalSymbol: string): Promise<FundingInfo | undefined>;

  /** Get all open orders. */
  getOpenOrders(): Promise<InFlightOrder[]>;

  /** Get account balances (asset → available). */
  getBalances(): Promise<Record<string, number>>;

  /** Get open positions. */
  getPositions(): Promise<Array<{ symbol: string; side: string; quantity: number; entryPrice: number }>>;

  /** Submit an order. */
  createOrder(request: ConnectorOrderRequest): Promise<ConnectorOrderResult>;

  /** Cancel an order. */
  cancelOrder(orderId: string, canonicalSymbol: string): Promise<ConnectorOrderResult>;

  /** Get a single order by exchange order ID. */
  getOrder(orderId: string, canonicalSymbol: string): Promise<InFlightOrder | undefined>;

  /** Get connector health. */
  getHealth(): Promise<ConnectorHealth>;

  /** Optional: connect user stream (WebSocket). */
  connectUserStream?(): Promise<void>;

  /** Optional: disconnect user stream. */
  disconnectUserStream?(): Promise<void>;
}
