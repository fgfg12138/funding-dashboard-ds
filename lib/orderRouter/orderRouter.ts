/**
 * Order Router — Live Phase 1
 *
 * Unified order routing layer that dispatches create / cancel / get
 * operations to the correct exchange adapter.
 *
 * All external trading operations MUST go through this router.
 */

import type { OrderAdapter } from "./adapters/OrderAdapter";
import type {
  ExchangeName,
  OrderExecutionResult,
  UnifiedOrder,
  UnifiedOrderRequest,
} from "./orderRouterTypes";
import { MockBinanceOrderAdapter } from "./adapters/MockBinanceOrderAdapter";
import { MockBybitOrderAdapter } from "./adapters/MockBybitOrderAdapter";
import { MockOkxOrderAdapter } from "./adapters/MockOkxOrderAdapter";

// ─── Adapter Registry ────────────────────────────────────

const ADAPTERS: Record<string, OrderAdapter> = {
  binance: new MockBinanceOrderAdapter(),
  bybit: new MockBybitOrderAdapter(),
  okx: new MockOkxOrderAdapter(),
};

/**
 * Get the order adapter for a given exchange.
 *
 * @param exchange - Exchange name.
 * @returns The OrderAdapter for the exchange.
 * @throws Error if the exchange is not supported.
 */
export function getAdapter(exchange: ExchangeName): OrderAdapter {
  const adapter = ADAPTERS[exchange];
  if (!adapter) {
    throw new Error(`Unsupported exchange: "${exchange}". Supported: ${Object.keys(ADAPTERS).join(", ")}`);
  }
  return adapter;
}

/**
 * Register or replace an adapter at runtime (useful for testing).
 */
export function registerAdapter(exchange: string, adapter: OrderAdapter): void {
  ADAPTERS[exchange] = adapter;
}

/**
 * Submit a new order.
 *
 * Automatically selects the correct adapter based on request.exchange.
 * Never throws — errors are captured in OrderExecutionResult.errors.
 *
 * @param request - The unified order request.
 * @returns OrderExecutionResult with the created order or error details.
 */
export async function createOrder(request: UnifiedOrderRequest): Promise<OrderExecutionResult> {
  try {
    const adapter = getAdapter(request.exchange);
    const order = await adapter.createOrder(request);
    return { success: true, order, errors: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, errors: [msg] };
  }
}

/**
 * Cancel an open order.
 *
 * @param exchange - Exchange the order belongs to.
 * @param orderId  - Exchange order ID.
 * @param symbol   - Trading pair symbol.
 * @returns OrderExecutionResult with the cancelled order or error details.
 */
export async function cancelOrder(
  exchange: ExchangeName,
  orderId: string,
  symbol: string,
): Promise<OrderExecutionResult> {
  try {
    const adapter = getAdapter(exchange);
    const order = await adapter.cancelOrder(orderId, symbol);
    return { success: true, order, errors: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, errors: [msg] };
  }
}

/**
 * Get the current state of an order.
 *
 * @param exchange - Exchange the order belongs to.
 * @param orderId  - Exchange order ID.
 * @param symbol   - Trading pair symbol.
 * @returns OrderExecutionResult with the order state or error details.
 */
export async function getOrder(
  exchange: ExchangeName,
  orderId: string,
  symbol: string,
): Promise<OrderExecutionResult> {
  try {
    const adapter = getAdapter(exchange);
    const order = await adapter.getOrder(orderId, symbol);
    return { success: true, order, errors: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, errors: [msg] };
  }
}
