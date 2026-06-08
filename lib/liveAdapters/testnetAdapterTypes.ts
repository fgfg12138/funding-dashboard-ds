/**
 * Testnet Adapter Types — Phase 5.6 Design Only
 *
 * This file defines the type contracts for future real testnet adapter implementations.
 *
 * **No function logic, no fetch/axios calls, no SDK imports.**
 * **No real order placement.**
 */

// ─── Exchange ───────────────────────────────────────────

export type TestnetExchangeId = "binance" | "okx" | "bybit";

// ─── Mode ───────────────────────────────────────────────

/** TestnetAdapter operating mode. Phase 5.6 only supports "design-only". */
export type TestnetAdapterMode = "design-only";

// ─── Environment Config ─────────────────────────────────

export type TestnetEnvironmentConfig = {
  exchangeId: TestnetExchangeId;
  baseUrl: string;
  wsUrl?: string;
  rateLimitPerSecond: number;
  /** Environment mode for safety checks. Default "disabled". */
  exchangeEnv?: "disabled" | "sandbox" | "testnet";
  /** Whether live trading is enabled. Must be false in Phase 5.7. */
  liveTradingEnabled?: boolean;
  /** Whether mainnet trading is allowed. Must be false. */
  allowMainnetTrading?: boolean;
};

// ─── Credential Ref ─────────────────────────────────────

/** Reference to a stored encrypted API Key. Server-side decryption only. */
export type TestnetCredentialRef = {
  recordId: string;
  /** Encrypted payload reference — not the plaintext secret. */
  encryptedRef: string;
};

// ─── Permission Check ───────────────────────────────────

export type TestnetPermissionCheckResult = {
  valid: boolean;
  canTrade: boolean;
  canWithdraw: boolean;
  hasIpWhitelist: boolean;
  ipWhitelist: string[];
  warnings: string[];
};

// ─── Order ──────────────────────────────────────────────

export type TestnetOrderRequest = {
  exchangeId: TestnetExchangeId;
  symbol: string;
  side: "Buy" | "Sell";
  orderType: "Market" | "Limit";
  quantity: number;
  price?: number;
  clientOrderId: string;
  timeInForce?: "GTC" | "IOC" | "FOK";
  reduceOnly?: boolean;
};

export type TestnetOrderResult = {
  exchangeId: TestnetExchangeId;
  orderId: string;
  clientOrderId: string;
  symbol: string;
  side: string;
  orderType: string;
  price: number;
  quantity: number;
  filledQuantity: number;
  status: string;
  source: "testnet-skeleton" | "testnet";
  submittedAt: number;
  filledAt?: number;
  errorMessage?: string;
};

export type TestnetEnvironmentValidationResult = {
  valid: boolean;
  exchangeId: TestnetExchangeId;
  baseUrl: string;
  warnings: string[];
};

// ─── Adapter Interface (Design Only) ────────────────────

/**
 * TestnetAdapter interface — Phase 5.6 design document.
 *
 * All methods are **interface declarations only**.
 * No implementation exists in this file.
 */
export interface TestnetAdapter {
  readonly exchangeId: TestnetExchangeId;
  readonly mode: TestnetAdapterMode;

  /** Validate testnet environment configuration. */
  validateEnvironment(): Promise<TestnetEnvironmentValidationResult>;

  /** Check API Key permissions against the real exchange testnet endpoint. */
  checkPermissions(ref: TestnetCredentialRef): Promise<TestnetPermissionCheckResult>;

  /** Place a testnet order. */
  placeTestnetOrder(request: TestnetOrderRequest): Promise<TestnetOrderResult>;

  /** Cancel a testnet order. */
  cancelTestnetOrder(orderId: string): Promise<boolean>;

  /** Get testnet order status. */
  getTestnetOrderStatus(orderId: string): Promise<TestnetOrderResult>;
}
