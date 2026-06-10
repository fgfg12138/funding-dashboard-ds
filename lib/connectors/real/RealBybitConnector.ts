/**
 * Real Bybit Connector — Real Connector Framework (Read-Only)
 *
 * Reads public Bybit linear perpetual data via GET endpoints.
 * No API key required. No trading.
 */

import { RealConnectorBase } from "./RealConnectorBase";
import type { FundingInfo } from "../fundingInfo";
import type { TradingRule } from "../tradingRule";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

// Bybit linear perpetual symbols use "BTCUSDT" format in public endpoints
const BYBIT_SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: "BTCUSDT",
  ETHUSDT: "ETHUSDT",
  SOLUSDT: "SOLUSDT",
};

export class RealBybitConnector extends RealConnectorBase {
  readonly exchangeId = "bybit";
  readonly baseUrl = "https://api.bybit.com";
  readonly healthCheckPath = "/v5/market/time";

  protected getExchangeSymbol(canonical: string): string {
    return BYBIT_SYMBOL_MAP[canonical] ?? canonical;
  }

  protected async fetchFundingInfo(canonicalSymbol: string): Promise<FundingInfo | undefined> {
    const exSym = this.getExchangeSymbol(canonicalSymbol);
    const data = await this.publicGet(`/v5/market/funding/history?category=linear&symbol=${exSym}&limit=1`);
    const result = (data as Record<string, unknown>)?.result as Record<string, unknown> | undefined;
    const list = result?.list as Array<Record<string, string>> | undefined;
    if (!list || list.length === 0) return undefined;

    const entry = list[0];
    const fundingRate = Number(entry.fundingRate ?? 0);
    const fundingTime = Number(entry.fundingRateTimestamp ?? Date.now());

    // Also get current mark price from tickers
    const tickerData = await this.publicGet(`/v5/market/tickers?category=linear&symbol=${exSym}`);
    const tickerResult = (tickerData as Record<string, unknown>)?.result as Record<string, unknown> | undefined;
    const tickerList = tickerResult?.list as Array<Record<string, string>> | undefined;
    const markPrice = tickerList && tickerList.length > 0 ? Number(tickerList[0].markPrice ?? 0) : 0;

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
    const data = await this.publicGet("/v5/market/instruments-info?category=linear");
    const result = (data as Record<string, unknown>)?.result as Record<string, unknown> | undefined;
    const list = result?.list as Array<Record<string, unknown>> | undefined;
    if (!list) return [];

    const symbolSet = new Set(SYMBOLS);
    return list
      .filter((s) => symbolSet.has(String(s.symbol)))
      .map((s) => {
        const lotSize = s.lotSizeFilter as Record<string, string> | undefined;
        const priceFilter = s.priceFilter as Record<string, string> | undefined;
        const sym = String(s.symbol);
        return {
          exchangeId: this.exchangeId,
          canonicalSymbol: sym,
          exchangeSymbol: sym,
          marketType: "perpetual" as const,
          minOrderSize: Number(lotSize?.minOrderQty ?? 0.001),
          maxOrderSize: Number(lotSize?.maxOrderQty ?? 1000),
          minPriceIncrement: Number(priceFilter?.tickSize ?? 0.01),
          minBaseAmountIncrement: Number(lotSize?.qtyStep ?? 0.001),
          minNotional: 5,
          supportsMarketOrder: true,
          supportsLimitOrder: true,
          supportsPostOnly: false,
          supportsReduceOnly: true,
          collateralToken: "USDT",
        };
      });
  }
}
