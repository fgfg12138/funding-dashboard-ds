/**
 * Real Binance Connector — Real Connector Framework (Read-Only)
 *
 * Reads public Binance USD-M Futures data via GET endpoints.
 * No API key required. No trading.
 */

import { RealConnectorBase } from "./RealConnectorBase";
import type { FundingInfo } from "../fundingInfo";
import type { TradingRule } from "../tradingRule";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

export class RealBinanceConnector extends RealConnectorBase {
  readonly exchangeId = "binance";
  readonly baseUrl = "https://fapi.binance.com";
  readonly healthCheckPath = "/fapi/v1/ping";

  protected getExchangeSymbol(canonical: string): string {
    return canonical; // Binance: BTCUSDT
  }

  protected async fetchFundingInfo(canonicalSymbol: string): Promise<FundingInfo | undefined> {
    const exchangeSymbol = this.getExchangeSymbol(canonicalSymbol);
    const data = await this.publicGet(`/fapi/v1/premiumIndex?symbol=${exchangeSymbol}`);
    const d = data as Record<string, unknown>;
    if (!d || !d.symbol) return undefined;

    return {
      exchangeId: this.exchangeId,
      canonicalSymbol,
      exchangeSymbol,
      markPrice: Number(d.markPrice ?? 0),
      indexPrice: Number(d.indexPrice ?? 0),
      lastFundingRate: Number(d.lastFundingRate ?? 0),
      nextFundingTime: Number(d.nextFundingTime ?? 0),
    };
  }

  protected async fetchTradingRules(): Promise<TradingRule[]> {
    const data = await this.publicGet("/fapi/v1/exchangeInfo");
    const info = data as Record<string, unknown>;
    const symbols = info.symbols as Array<Record<string, unknown>>;
    if (!Array.isArray(symbols)) return [];

    const symbolSet = new Set(SYMBOLS);
    return symbols
      .filter((s) => symbolSet.has(String(s.symbol)))
      .map((s) => {
        const filters = (s.filters as Array<Record<string, string>>) ?? [];
        const priceFilter = filters.find((f) => f.filterType === "PRICE_FILTER");
        const lotSize = filters.find((f) => f.filterType === "LOT_SIZE");
        const minNotional = filters.find((f) => f.filterType === "MIN_NOTIONAL");
        const sym = String(s.symbol);
        return {
          exchangeId: this.exchangeId,
          canonicalSymbol: sym,
          exchangeSymbol: sym,
          marketType: "perpetual" as const,
          minOrderSize: Number(lotSize?.minQty ?? 0.001),
          maxOrderSize: Number(lotSize?.maxQty ?? 1000),
          minPriceIncrement: Number(priceFilter?.tickSize ?? 0.01),
          minBaseAmountIncrement: Number(lotSize?.stepSize ?? 0.001),
          minNotional: Number(minNotional?.notional ?? 5),
          supportsMarketOrder: true,
          supportsLimitOrder: true,
          supportsPostOnly: true,
          supportsReduceOnly: true,
          collateralToken: "USDT",
        };
      });
  }
}
