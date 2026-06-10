/**
 * Real OKX Connector — Real Connector Framework (Read-Only)
 *
 * Reads public OKX perpetual swap data via GET endpoints.
 * No API key required. No trading.
 */

import { RealConnectorBase } from "./RealConnectorBase";
import type { FundingInfo } from "../fundingInfo";
import type { TradingRule } from "../tradingRule";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

const OKX_SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: "BTC-USDT-SWAP",
  ETHUSDT: "ETH-USDT-SWAP",
  SOLUSDT: "SOL-USDT-SWAP",
};

const OKX_REVERSE_MAP: Record<string, string> = {
  "BTC-USDT-SWAP": "BTCUSDT",
  "ETH-USDT-SWAP": "ETHUSDT",
  "SOL-USDT-SWAP": "SOLUSDT",
};

export class RealOkxConnector extends RealConnectorBase {
  readonly exchangeId = "okx";
  readonly baseUrl = "https://www.okx.com";
  readonly healthCheckPath = "/api/v5/public/time";

  protected getExchangeSymbol(canonical: string): string {
    return OKX_SYMBOL_MAP[canonical] ?? canonical;
  }

  protected async fetchFundingInfo(canonicalSymbol: string): Promise<FundingInfo | undefined> {
    const exSym = this.getExchangeSymbol(canonicalSymbol);
    const data = await this.publicGet(`/api/v5/public/funding-rate?instId=${exSym}`);
    const d = data as Record<string, unknown>;
    const list = d.data as Array<Record<string, string>> | undefined;
    if (!list || list.length === 0) return undefined;

    const entry = list[0];
    const fundingRate = Number(entry.fundingRate ?? 0);
    const fundingTime = Number(entry.fundingTime ?? Date.now());

    // Get mark price from mark price endpoint
    const tickerData = await this.publicGet(`/api/v5/public/mark-price?instType=SWAP&instId=${exSym}`);
    const td = tickerData as Record<string, unknown>;
    const tickerList = td.data as Array<Record<string, string>> | undefined;
    const markPrice = tickerList && tickerList.length > 0 ? Number(tickerList[0].markPx ?? 0) : 0;

    return {
      exchangeId: this.exchangeId,
      canonicalSymbol,
      exchangeSymbol: exSym,
      markPrice,
      lastFundingRate: fundingRate,
      nextFundingTime: fundingTime + 8 * 3600_000, // 8h interval
    };
  }

  protected async fetchTradingRules(): Promise<TradingRule[]> {
    const data = await this.publicGet("/api/v5/public/instruments?instType=SWAP");
    const d = data as Record<string, unknown>;
    const list = d.data as Array<Record<string, string>> | undefined;
    if (!list) return [];

    const symbolSet = new Set(SYMBOLS);
    return list
      .filter((s) => symbolSet.has(OKX_REVERSE_MAP[String(s.instId)] ?? ""))
      .map((s) => {
        const instId = String(s.instId);
        const canonical = OKX_REVERSE_MAP[instId] ?? instId;
        return {
          exchangeId: this.exchangeId,
          canonicalSymbol: canonical,
          exchangeSymbol: instId,
          marketType: "perpetual" as const,
          minOrderSize: Number(s.minSz ?? 0.001),
          maxOrderSize: Number(s.maxMktSz ?? 1000) || 1000,
          minPriceIncrement: Number(s.tickSz ?? 0.01),
          minBaseAmountIncrement: Number(s.lotSz ?? 0.001),
          minNotional: 5,
          supportsMarketOrder: true,
          supportsLimitOrder: true,
          supportsPostOnly: false,
          supportsReduceOnly: true,
          collateralToken: s.ctValCcy ? String(s.ctValCcy) : "USDT",
        };
      });
  }
}
