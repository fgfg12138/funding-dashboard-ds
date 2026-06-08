/**
 * Testnet Environment Config — Phase 5.16 Design Only
 *
 * Pure functions to get default config, parse from env, and validate.
 * No secret reading, no decryption, no signing, no network calls.
 */

import type {
  TestnetEnvConfig,
  TestnetEnvMode,
  TestnetEnvRaw,
  TestnetEnvConfigValidationResult,
} from "./testnetEnvTypes";

/**
 * Get the default testnet environment configuration.
 * All safety flags are disabled.
 */
export function getDefaultTestnetEnvConfig(): TestnetEnvConfig {
  return {
    exchangeEnv: "disabled",
    liveTradingEnabled: false,
    allowMainnetTrading: false,
    testnetRoutesEnabled: false,
    testnetOrderSubmitEnabled: false,
  };
}

/**
 * Parse raw environment values into a TestnetEnvConfig.
 * Unknown values fall back to defaults.
 *
 * @param raw - Raw env object (e.g. process.env or test fixture).
 * @returns A parsed TestnetEnvConfig.
 */
export function parseTestnetEnvConfig(raw: TestnetEnvRaw): TestnetEnvConfig {
  const defaults = getDefaultTestnetEnvConfig();

  const exchangeEnv = parseEnvMode(raw.EXCHANGE_ENV);
  const liveTradingEnabled = parseBool(raw.LIVE_TRADING_ENABLED, defaults.liveTradingEnabled);
  const allowMainnetTrading = parseBool(raw.ALLOW_MAINNET_TRADING, defaults.allowMainnetTrading);
  const testnetRoutesEnabled = parseBool(raw.TESTNET_ROUTES_ENABLED, defaults.testnetRoutesEnabled);
  const testnetOrderSubmitEnabled = parseBool(raw.TESTNET_ORDER_SUBMIT_ENABLED, defaults.testnetOrderSubmitEnabled);

  return {
    exchangeEnv,
    liveTradingEnabled,
    allowMainnetTrading,
    testnetRoutesEnabled,
    testnetOrderSubmitEnabled,
  };
}

/**
 * Validate a testnet environment configuration.
 *
 * Rules:
 * - allowMainnetTrading=true → invalid (always)
 * - liveTradingEnabled=true → invalid (always)
 * - testnetOrderSubmitEnabled=true → invalid (Phase 5.16)
 * - testnetRoutesEnabled=true → warning (allowed for testing, but no orders)
 * - Default config → valid (disabled)
 *
 * @param config - The config to validate.
 * @returns Validation result with errors and warnings.
 */
export function validateTestnetEnvConfig(config: TestnetEnvConfig): TestnetEnvConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Always invalid
  if (config.allowMainnetTrading) {
    errors.push("ALLOW_MAINNET_TRADING must be false — mainnet trading is never allowed from this config");
  }

  if (config.liveTradingEnabled) {
    errors.push("LIVE_TRADING_ENABLED must be false — live trading is never allowed from this config");
  }

  // Invalid in Phase 5.16
  if (config.testnetOrderSubmitEnabled) {
    errors.push("TESTNET_ORDER_SUBMIT_ENABLED must be false — order submission disabled in Phase 5.16 skeleton");
  }

  // Warning (not invalid)
  if (config.testnetRoutesEnabled) {
    warnings.push("TESTNET_ROUTES_ENABLED is true — route skeleton accessible but all requests return 403");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Internal Helpers ────────────────────────────────────

function parseEnvMode(val?: string): TestnetEnvMode {
  if (val === "sandbox" || val === "testnet") return val;
  return "disabled";
}

function parseBool(val: string | undefined, defaultVal: boolean): boolean {
  if (val === undefined || val === null) return defaultVal;
  if (val === "true" || val === "1" || val === "yes") return true;
  if (val === "false" || val === "0" || val === "no") return false;
  return defaultVal;
}
