/**
 * Testnet Environment Config Types — Phase 5.16 Design Only
 *
 * Defines the testnet environment configuration types and validation rules.
 * No secret reading, no decryption, no signing, no network calls.
 */

// ─── Environment Mode ────────────────────────────────────

export type TestnetEnvMode = "disabled" | "sandbox" | "testnet";

// ─── Config ──────────────────────────────────────────────

export type TestnetEnvConfig = {
  /** Operating mode. Default "disabled". */
  exchangeEnv: TestnetEnvMode;
  /** Whether live trading is enabled. Must always be false. */
  liveTradingEnabled: boolean;
  /** Whether mainnet trading is allowed. Must always be false. */
  allowMainnetTrading: boolean;
  /** Whether testnet API routes are accessible. Can be true for testing skeleton, but no orders. */
  testnetRoutesEnabled: boolean;
  /** Whether testnet order submission is allowed. Must be false in Phase 5.16. */
  testnetOrderSubmitEnabled: boolean;
};

// ─── Validation ──────────────────────────────────────────

export type TestnetEnvConfigValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

// ─── Parse Input ─────────────────────────────────────────

/** Raw environment values that may come from process.env or config files. */
export type TestnetEnvRaw = {
  EXCHANGE_ENV?: string;
  LIVE_TRADING_ENABLED?: string;
  ALLOW_MAINNET_TRADING?: string;
  TESTNET_ROUTES_ENABLED?: string;
  TESTNET_ORDER_SUBMIT_ENABLED?: string;
};
