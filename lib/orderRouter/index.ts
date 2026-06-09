/**
 * Order Router — Barrel export
 *
 * Re-exports all Live-1 types, engine functions, and mock adapters.
 */

// Types
export type {
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
  getOrder,
  registerAdapter,
} from "./orderRouter";

// Adapter interface
export type { OrderAdapter } from "./adapters/OrderAdapter";

// Mock adapters
export { MockBinanceOrderAdapter } from "./adapters/MockBinanceOrderAdapter";
export { MockBybitOrderAdapter } from "./adapters/MockBybitOrderAdapter";
export { MockOkxOrderAdapter } from "./adapters/MockOkxOrderAdapter";
