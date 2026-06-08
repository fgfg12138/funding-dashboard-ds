/**
 * Mock Sandbox Trading Adapter — Phase 5.1
 *
 * Implements the TradingAdapter interface for mock sandbox testing.
 * No network requests, no API Key access, no real order placement.
 * All results are marked source: "mock-sandbox".
 */

import type { ExchangeName } from "../exchanges/types";
import type { OrderPreview } from "../orders/orderPreviewTypes";
import type { ConfirmationRecord } from "../orders/orderConfirmationTypes";
import type {
  EnvironmentValidationResult,
  PermissionValidationResult,
  TradingAdapter,
  TradingAdapterMode,
  TradingOrderRequest,
  TradingOrderResult,
} from "./tradingAdapterTypes";

let mockOrderCounter = 1;

/**
 * Create a mock sandbox TradingAdapter for the given exchange.
 * The exchangeId is used for single-venue adapters; for multi-leg previews
 * call `buildSandboxOrderRequests` which assigns the correct venue per leg.
 *
 * @param exchangeId  Exchange name (e.g. "Binance").
 * @returns A TradingAdapter that returns mock sandbox results.
 */
export function createMockSandboxTradingAdapter(exchangeId: ExchangeName): TradingAdapter {
  const mode: TradingAdapterMode = "design-only";

  async function validateEnvironment(): Promise<EnvironmentValidationResult> {
    return {
      valid: true,
      environment: "sandbox",
      warnings: ["Mock Sandbox 环境 — 不连接真实交易所"],
    };
  }

  async function validatePermissions(): Promise<PermissionValidationResult> {
    return {
      valid: true,
      canTrade: true,
      canWithdraw: false,
      warnings: [
        "Mock Sandbox 权限验证 — 不连接交易所 API",
        "所有权限检查为模拟结果，不可用于真实交易",
      ],
    };
  }

  /**
   * Build one TradingOrderRequest per preview leg.
   * Each leg retains its own venue, side, marketType, and notionalUsd.
   */
  function buildSandboxOrderRequests(preview: OrderPreview, confirmation: ConfirmationRecord): TradingOrderRequest[] {
    if (!preview.legs || preview.legs.length === 0) {
      // Fallback: generate a single request from preview-level data
      return [
        {
          exchangeId,
          symbol: preview.symbol,
          marketType: "perp",
          intent: "open",
          side: "buy",
          orderType: "market",
          quantity: 0.001,
          notionalUsd: 1000,
          reduceOnly: false,
          clientOrderId: `mock-${exchangeId}-${Date.now()}`,
          previewId: preview.id,
          confirmationId: confirmation.id,
        },
      ];
    }

    return preview.legs.map((leg) => {
      const quantity = leg.estimatedEntryPrice > 0
        ? leg.notionalUsd / leg.estimatedEntryPrice
        : 0.001;

      return {
        exchangeId: leg.venue,
        symbol: leg.symbol,
        marketType: leg.marketType === "perp" ? "perp" : "spot",
        intent: "open",
        side: leg.side,
        orderType: leg.orderType === "limit-preview" ? "limit" : "market",
        quantity,
        notionalUsd: leg.notionalUsd,
        reduceOnly: false,
        clientOrderId: `mock-${leg.venue}-${Date.now()}`,
        previewId: preview.id,
        confirmationId: confirmation.id,
      };
    });
  }

  async function submitSandboxOrder(request: TradingOrderRequest): Promise<TradingOrderResult> {
    const now = Date.now();
    const orderId = `mock-sandbox-${request.exchangeId}-${mockOrderCounter++}-${now}`;

    return {
      exchangeId: request.exchangeId,
      orderId,
      clientOrderId: request.clientOrderId,
      symbol: request.symbol,
      side: request.side,
      orderType: request.orderType,
      price: request.price ?? 0,
      quantity: request.quantity,
      filledQuantity: 0,
      status: "sandbox-submitted",
      source: "mock-sandbox",
      fee: 0,
      submittedAt: now,
      errorMessage: undefined,
    };
  }

  async function cancelSandboxOrder(_orderId: string): Promise<boolean> {
    return true;
  }

  async function getSandboxOrderStatus(orderId: string): Promise<TradingOrderResult> {
    const now = Date.now();

    return {
      exchangeId,
      orderId,
      clientOrderId: `mock-${exchangeId}-related`,
      symbol: "BTC/USDT",
      side: "buy",
      orderType: "market",
      price: 68000,
      quantity: 0.01,
      filledQuantity: 0.01,
      status: "sandbox-filled",
      source: "mock-sandbox",
      fee: 0.5,
      filledPrice: 67980,
      submittedAt: now - 2000,
      filledAt: now - 1000,
    };
  }

  return {
    exchangeId,
    mode,
    validateEnvironment,
    validatePermissions,
    buildSandboxOrderRequests,
    submitSandboxOrder,
    cancelSandboxOrder,
    getSandboxOrderStatus,
  };
}

/** Reset the mock order counter (for tests). */
export function resetMockSandboxCounter(): void {
  mockOrderCounter = 1;
}
