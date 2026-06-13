/**
 * Create Real Connectors — Real Connector Framework (Read-Only)
 *
 * Factory that creates read-only connectors for Binance, OKX, and HTX.
 * Bybit, Bitget, Gate, Hyperliquid excluded per policy.
 * No API keys required — public endpoints only.
 */

import type { ExchangeConnector } from "../connectorTypes";
import { RealBinanceConnector } from "./RealBinanceConnector";
import { RealOkxConnector } from "./RealOkxConnector";
import { RealHtxConnector } from "./RealHtxConnector";

export function createRealConnectors(): Record<string, ExchangeConnector> {
  return {
    binance: new RealBinanceConnector(),
    okx: new RealOkxConnector(),
    htx: new RealHtxConnector(),
  };
}
