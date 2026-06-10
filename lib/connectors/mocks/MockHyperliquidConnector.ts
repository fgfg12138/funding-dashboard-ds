/**
 * Mock Hyperliquid Connector — Multi-Exchange Connector Spec
 */

import { MockConnectorBase } from "./MockConnectorBase";

const SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: "BTC",
  ETHUSDT: "ETH",
  SOLUSDT: "SOL",
};

export class MockHyperliquidConnector extends MockConnectorBase {
  readonly exchangeId = "hyperliquid";

  protected getExchangeSymbol(canonical: string): string {
    return SYMBOL_MAP[canonical] ?? canonical;
  }

  protected getFundingRate(canonical: string): number {
    const rates: Record<string, number> = { BTCUSDT: -0.00015, ETHUSDT: -0.00012, SOLUSDT: 0.00008 };
    return rates[canonical] ?? 0;
  }
}
