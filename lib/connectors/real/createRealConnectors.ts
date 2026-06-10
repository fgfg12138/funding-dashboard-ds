/**
 * Create Real Connectors — Real Connector Framework (Read-Only)
 *
 * Factory that creates read-only connectors for Binance, Bybit, and OKX.
 * No API keys required — public endpoints only.
 */

import type { ExchangeConnector } from "../connectorTypes";
import { RealBinanceConnector } from "./RealBinanceConnector";
import { RealBybitConnector } from "./RealBybitConnector";
import { RealOkxConnector } from "./RealOkxConnector";

export function createRealConnectors(): Record<string, ExchangeConnector> {
  return {
    binance: new RealBinanceConnector(),
    bybit: new RealBybitConnector(),
    okx: new RealOkxConnector(),
  };
}
