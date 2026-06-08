/**
 * Environment configuration for exchange API endpoints.
 *
 * All values have safe defaults for the public endpoints used in V1.
 * Override via environment variables when running tests or CI.
 */

export const EXCHANGE_API_URLS = {
  BINANCE_FUTURES: process.env.BINANCE_FUTURES_URL ?? "https://fapi.binance.com",
  BINANCE_SPOT: process.env.BINANCE_SPOT_URL ?? "https://api.binance.com",
  OKX: process.env.OKX_URL ?? "https://www.okx.com",
  BYBIT: process.env.BYBIT_URL ?? "https://api.bybit.com",
} as const;

/** Root directory for local data files (history, simulation, config). */
export const DATA_DIR = process.env.DATA_DIR ?? ".data";
