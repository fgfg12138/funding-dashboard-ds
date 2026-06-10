/**
 * Mock OKX Connector — Multi-Exchange Connector Spec
 */

import { MockConnectorBase } from "./MockConnectorBase";

const SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: "BTC-USDT-SWAP",
  ETHUSDT: "ETH-USDT-SWAP",
  SOLUSDT: "SOL-USDT-SWAP",
};

export class MockOkxConnector extends MockConnectorBase {
  readonly exchangeId = "okx";

  protected getExchangeSymbol(canonical: string): string {
    return SYMBOL_MAP[canonical] ?? canonical;
  }

  protected getFundingRate(canonical: string): number {
    const rates: Record<string, number> = { BTCUSDT: 0.00005, ETHUSDT: 0.00003, SOLUSDT: -0.00002 };
    return rates[canonical] ?? 0;
  }
}
