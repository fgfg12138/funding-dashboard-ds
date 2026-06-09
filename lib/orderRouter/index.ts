/**
 * Order Router — Barrel export
 *
 * Re-exports all Live-1 types, engine functions, and mock adapters.
 */

// Types
export type {
  ExchangeCapabilities,
  ExchangeName,
  OrderExecutionResult,
  OrderSide,
  OrderStatus,
  OrderType,
  UnifiedOrder,
  UnifiedOrderRequest,
} from "./orderRouterTypes";

// Engine
export {
  cancelOrder,
  createOrder,
  getAdapter,
  getExchangeCapabilities,
  getOrder,
  registerAdapter,
  registerExchangeCapabilities,
} from "./orderRouter";

// Adapter interface
export type { OrderAdapter } from "./adapters/OrderAdapter";

// Mock adapters
export { MockBinanceOrderAdapter } from "./adapters/MockBinanceOrderAdapter";
export { MockBybitOrderAdapter } from "./adapters/MockBybitOrderAdapter";
export { MockOkxOrderAdapter } from "./adapters/MockOkxOrderAdapter";

// Binance Real Adapter
export type { BinanceAdapterConfig } from "./adapters/binance/BinanceRealOrderAdapter";
export { BinanceRealOrderAdapter } from "./adapters/binance/BinanceRealOrderAdapter";
export { signParams, addSignature } from "./adapters/binance/BinanceSigning";
export {
  mapBinanceOrderToUnifiedOrder,
  mapSideFromBinance,
  mapSideToBinance,
  mapStatusFromBinance,
  mapTypeFromBinance,
  mapTypeToBinance,
  mapUnifiedOrderRequestToBinance,
} from "./adapters/binance/BinanceOrderMapper";
export type { BinanceHttpClient, HttpMethod, HttpRequestOptions, HttpResponse } from "./adapters/binance/BinanceHttpClient";
export { MockBinanceHttpClient } from "./adapters/binance/BinanceHttpClient";

/**
 * Register Binance exchange capabilities for use with the Order Router.
 */
import { registerExchangeCapabilities } from "./orderRouter";
import type { ExchangeCapabilities } from "./orderRouterTypes";

export function registerBinanceCapabilities(): void {
  const caps: ExchangeCapabilities = {
    exchange: "binance",
    supportsSpot: true,
    supportsPerpetual: true,
    supportsMargin: true,
    supportsMarketOrder: true,
    supportsLimitOrder: true,
    supportsReduceOnly: true,
    supportsPostOnly: true,
    maxLeverage: 125,
  };
  registerExchangeCapabilities(caps);
}
