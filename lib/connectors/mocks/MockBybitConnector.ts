/**
 * Mock Bybit Connector — Multi-Exchange Connector Spec
 */

import { MockConnectorBase } from "./MockConnectorBase";

export class MockBybitConnector extends MockConnectorBase {
  readonly exchangeId = "bybit";

  protected getExchangeSymbol(canonical: string): string {
    return canonical; // Bybit: BTCUSDT
  }

  protected getFundingRate(canonical: string): number {
    const rates: Record<string, number> = { BTCUSDT: -0.0002, ETHUSDT: -0.00015, SOLUSDT: 0.0001 };
    return rates[canonical] ?? 0;
  }
}
