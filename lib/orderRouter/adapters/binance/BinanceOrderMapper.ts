/**
 * Binance Order Mapper — Binance Real Order Adapter
 *
 * Maps between UnifiedOrderRequest / UnifiedOrder and Binance REST API
 * JSON payloads for USD-M Futures (/fapi/v1/order).
 *
 * Pure functions — no side effects.
 */

import type { UnifiedOrder, UnifiedOrderRequest } from "../../orderRouterTypes";

// ─── Side Mapping ───────────────────────────────────────

export function mapSideToBinance(side: "buy" | "sell"): string {
  return side === "buy" ? "BUY" : "SELL";
}

export function mapSideFromBinance(binanceSide: string): "buy" | "sell" {
  return binanceSide === "BUY" ? "buy" : "sell";
}

// ─── Type Mapping ───────────────────────────────────────

export function mapTypeToBinance(type: "market" | "limit"): string {
  return type === "market" ? "MARKET" : "LIMIT";
}

export function mapTypeFromBinance(binanceType: string): "market" | "limit" {
  return binanceType === "MARKET" ? "market" : "limit";
}

// ─── Status Mapping ─────────────────────────────────────

const BINANCE_STATUS_MAP: Record<string, "open" | "filled" | "cancelled" | "rejected"> = {
  NEW: "open",
  PARTIALLY_FILLED: "open",
  FILLED: "filled",
  CANCELED: "cancelled",
  REJECTED: "rejected",
  EXPIRED: "cancelled",
};

export function mapStatusFromBinance(binanceStatus: string): "open" | "filled" | "cancelled" | "rejected" {
  return BINANCE_STATUS_MAP[binanceStatus] ?? "rejected";
}

// ─── Request Mapping ────────────────────────────────────

export type BinanceNewOrderParams = Record<string, string | number | undefined>;

/**
 * Map a UnifiedOrderRequest to Binance REST API POST /fapi/v1/order parameters.
 */
export function mapUnifiedOrderRequestToBinance(request: UnifiedOrderRequest): BinanceNewOrderParams {
  const params: BinanceNewOrderParams = {
    symbol: request.symbol,
    side: mapSideToBinance(request.side),
    type: mapTypeToBinance(request.type),
    quantity: request.quantity,
    newClientOrderId: request.clientOrderId,
    timestamp: Date.now(),
  };

  if (request.type === "limit" && request.price !== undefined) {
    params.price = request.price;
    params.timeInForce = "GTC"; // Good-Til-Cancelled for limit orders
  }

  return params;
}

/**
 * Map a Binance REST API order response to a UnifiedOrder.
 */
export function mapBinanceOrderToUnifiedOrder(
  binanceResponse: Record<string, unknown>,
  exchange: string,
): UnifiedOrder {
  const now = Date.now();
  const status = mapStatusFromBinance(String(binanceResponse.status ?? ""));

  return {
    exchange,
    orderId: String(binanceResponse.orderId ?? ""),
    clientOrderId: binanceResponse.clientOrderId !== undefined ? String(binanceResponse.clientOrderId) : undefined,
    symbol: String(binanceResponse.symbol ?? ""),
    side: mapSideFromBinance(String(binanceResponse.side ?? "BUY")),
    type: mapTypeFromBinance(String(binanceResponse.type ?? "MARKET")),
    quantity: Number(binanceResponse.origQty ?? 0),
    filledQuantity: Number(binanceResponse.executedQty ?? 0),
    price: binanceResponse.price !== undefined ? Number(binanceResponse.price) : undefined,
    status,
    createdAt: binanceResponse.updateTime !== undefined ? Number(binanceResponse.updateTime) : now,
    updatedAt: now,
  };
}
