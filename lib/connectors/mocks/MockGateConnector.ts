/**
 * Mock Gate.io Connector — Multi-Exchange Connector Spec
 */

import { MockConnectorBase } from "./MockConnectorBase";

const SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: "BTC_USDT",
  ETHUSDT: "ETH_USDT",
  SOLUSDT: "SOL_USDT",
};

export class MockGateConnector extends MockConnectorBase {
  readonly exchangeId = "gate";

  protected getExchangeSymbol(canonical: string): string {
    return SYMBOL_MAP[canonical] ?? canonical;
  }

  protected getFundingRate(canonical: string): number {
    const rates: Record<string, number> = { BTCUSDT: 0.00008, ETHUSDT: 0.00006, SOLUSDT: -0.00003 };
    return rates[canonical] ?? 0;
  }
}
