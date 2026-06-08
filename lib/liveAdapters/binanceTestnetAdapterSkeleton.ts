/**
 * Binance Testnet Adapter Skeleton — Phase 5.7
 *
 * Implements the TestnetAdapter interface for Binance testnet.
 * All methods return disabled/blocked results.
 * No network requests, no API Key access, no signing, no real trading.
 */

import type { TestnetAdapter, TestnetAdapterMode, TestnetCredentialRef, TestnetEnvironmentConfig, TestnetEnvironmentValidationResult, TestnetOrderRequest, TestnetOrderResult, TestnetPermissionCheckResult } from "./testnetAdapterTypes";

/**
 * Create a Binance testnet adapter skeleton.
 *
 * @param config  Testnet environment configuration.
 * @returns A TestnetAdapter skeleton — all methods return disabled/blocked.
 */
export function createBinanceTestnetAdapterSkeleton(config: TestnetEnvironmentConfig): TestnetAdapter {
  const mode: TestnetAdapterMode = "design-only";
  const exchangeId = "binance";

  async function validateEnvironment(): Promise<TestnetEnvironmentValidationResult> {
    const warnings: string[] = ["Binance Testnet Skeleton — 不连接真实 Binance Testnet"];
    const exchangeEnv = config.exchangeEnv ?? "disabled";
    const liveTradingEnabled = config.liveTradingEnabled ?? false;
    const allowMainnetTrading = config.allowMainnetTrading ?? false;

    if (exchangeEnv !== "testnet") {
      warnings.push(`exchangeEnv 为 "${exchangeEnv}" — 仅允许 "testnet"`);
    }
    if (liveTradingEnabled) {
      warnings.push("LIVE_TRADING_ENABLED 不允许为 true");
    }
    if (allowMainnetTrading) {
      warnings.push("ALLOW_MAINNET_TRADING 不允许为 true");
    }

    const valid = exchangeEnv === "testnet" && !liveTradingEnabled && !allowMainnetTrading;
    return { valid, exchangeId, baseUrl: config.baseUrl, warnings };
  }

  async function checkPermissions(_ref: TestnetCredentialRef): Promise<TestnetPermissionCheckResult> {
    return {
      valid: false,
      canTrade: false,
      canWithdraw: false,
      hasIpWhitelist: false,
      ipWhitelist: [],
      warnings: ["Skeleton 模式 — 不解密 Secret，不调用 Binance API", "permission-check-disabled"],
    };
  }

  async function placeTestnetOrder(request: TestnetOrderRequest): Promise<TestnetOrderResult> {
    return {
      exchangeId: request.exchangeId,
      orderId: `skeleton-${Date.now()}`,
      clientOrderId: request.clientOrderId,
      symbol: request.symbol,
      side: request.side,
      orderType: request.orderType,
      price: request.price ?? 0,
      quantity: request.quantity,
      filledQuantity: 0,
      status: "testnet-blocked",
      source: "testnet-skeleton",
      submittedAt: Date.now(),
      errorMessage: "Testnet order placement disabled in skeleton",
    };
  }

  async function cancelTestnetOrder(_orderId: string): Promise<boolean> {
    return false;
  }

  async function getTestnetOrderStatus(orderId: string): Promise<TestnetOrderResult> {
    return {
      exchangeId,
      orderId,
      clientOrderId: `skeleton-${orderId}`,
      symbol: "UNKNOWN",
      side: "Buy",
      orderType: "Market",
      price: 0,
      quantity: 0,
      filledQuantity: 0,
      status: "testnet-unknown",
      source: "testnet-skeleton",
      submittedAt: Date.now(),
      errorMessage: "Skeleton mode — no order status available",
    };
  }

  return {
    exchangeId,
    mode,
    validateEnvironment,
    checkPermissions,
    placeTestnetOrder,
    cancelTestnetOrder,
    getTestnetOrderStatus,
  };
}
