/**
 * Create Mock Connectors — Multi-Exchange Connector Spec
 *
 * Factory that instantiates all 6 mock exchange connectors.
 */

import type { ExchangeConnector } from "../connectorTypes";
import { MockBinanceConnector } from "./MockBinanceConnector";
import { MockBybitConnector } from "./MockBybitConnector";
import { MockOkxConnector } from "./MockOkxConnector";
import { MockBitgetConnector } from "./MockBitgetConnector";
import { MockGateConnector } from "./MockGateConnector";
import { MockHyperliquidConnector } from "./MockHyperliquidConnector";

export function createMockConnectors(): Record<string, ExchangeConnector> {
  return {
    binance: new MockBinanceConnector(),
    bybit: new MockBybitConnector(),
    okx: new MockOkxConnector(),
    bitget: new MockBitgetConnector(),
    gate: new MockGateConnector(),
    hyperliquid: new MockHyperliquidConnector(),
  };
}
