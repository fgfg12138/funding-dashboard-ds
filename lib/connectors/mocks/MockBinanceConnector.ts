/**
 * Mock Binance Connector — Multi-Exchange Connector Spec
 */

import { MockConnectorBase } from "./MockConnectorBase";

export class MockBinanceConnector extends MockConnectorBase {
  readonly exchangeId = "binance";

  protected getExchangeSymbol(canonical: string): string {
    return canonical; // Binance: BTCUSDT
  }

  protected getFundingRate(canonical: string): number {
    const rates: Record<string, number> = { BTCUSDT: 0.0001, ETHUSDT: 0.00008, SOLUSDT: -0.00005 };
    return rates[canonical] ?? 0;
  }
}
