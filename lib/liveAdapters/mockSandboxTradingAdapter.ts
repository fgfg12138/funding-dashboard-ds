/**
 * Mock Sandbox Trading Adapter — Phase 5.1
 *
 * Implements the TradingAdapter interface for mock sandbox testing.
 * No network requests, no API Key access, no real order placement.
 * All results are marked source: "mock-sandbox".
 */

import type { ExchangeName } from "../exchanges/types";
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

  function buildSandboxOrderRequest(preview?: any, confirmation?: any): TradingOrderRequest {
    const legs = preview?.legs ?? [];
    const totalNotional = legs.reduce((s: number, leg: any) => s + (leg.notionalUsd ?? 0), 0);
    const firstLeg = legs[0] ?? {};

    return {
      exchangeId: firstLeg.venue ?? exchangeId,
      symbol: preview?.symbol ?? "BTC/USDT",
      marketType: firstLeg.marketType === "perp" ? "perp" : "spot",
      intent: legs.some((l: any) => l.side === "short") ? "open" : "open",
      side: firstLeg.side ?? "buy",
      orderType: firstLeg.orderType ?? "market",
      quantity: totalNotional / (firstLeg.estimatedEntryPrice ?? 68000) || 0.001,
      notionalUsd: totalNotional || 1000,
      reduceOnly: false,
      clientOrderId: `mock-${exchangeId}-${Date.now()}`,
      previewId: preview?.id,
      confirmationId: confirmation?.id,
    };
  }

  async function submitSandboxOrder(request: TradingOrderRequest): Promise<TradingOrderResult> {
    const now = Date.now();
    const orderId = `mock-sandbox-${exchangeId}-${mockOrderCounter++}-${now}`;

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
    buildSandboxOrderRequest,
    submitSandboxOrder,
    cancelSandboxOrder,
    getSandboxOrderStatus,
  };
}

/** Reset the mock order counter (for tests). */
export function resetMockSandboxCounter(): void {
  mockOrderCounter = 1;
}
