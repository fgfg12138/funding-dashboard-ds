/**
 * Real HTX (Huobi) Connector — Non-Bybit Exchange Expansion Plan
 *
 * Reads public HTX USDT perpetual swap data via GET endpoints.
 * No API key required. No trading.
 *
 * HTX Linear Swap API: https://api.hbdm.com/linear-swap-api/v1/
 * Symbol format: BTC-USDT (dash-separated, no SWAP suffix)
 */

import { RealConnectorBase } from "./RealConnectorBase";
import type { FundingInfo } from "../fundingInfo";
import type { TradingRule } from "../tradingRule";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

const HTX_SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: "BTC-USDT",
  ETHUSDT: "ETH-USDT",
  SOLUSDT: "SOL-USDT",
};

const HTX_REVERSE_MAP: Record<string, string> = {
  "BTC-USDT": "BTCUSDT",
  "ETH-USDT": "ETHUSDT",
  "SOL-USDT": "SOLUSDT",
};

type HtxContractInfo = {
  contract_code: string;
  contract_size: number;
  price_tick: number;
  contract_status: number;
};

type HtxFundingData = {
  funding_rate: string;
  contract_code: string;
  funding_time: string;
  next_funding_time: string | null;
};

export class RealHtxConnector extends RealConnectorBase {
  readonly exchangeId = "htx";
  readonly baseUrl = "https://api.hbdm.com";
  readonly healthCheckPath = "/linear-swap-api/v1/swap_api_state";

  protected getExchangeSymbol(canonical: string): string {
    return HTX_SYMBOL_MAP[canonical] ?? canonical;
  }

  protected async fetchFundingInfo(canonicalSymbol: string): Promise<FundingInfo | undefined> {
    const exSym = this.getExchangeSymbol(canonicalSymbol);

    // Get funding rate
    const frData = await this.publicGet(`/linear-swap-api/v1/swap_funding_rate?contract_code=${exSym}`);
    const fr = frData as Record<string, unknown>;
    if (fr.status !== "ok") return undefined;
    const frd = fr.data as HtxFundingData | undefined;
    if (!frd) return undefined;

    const fundingRate = Number(frd.funding_rate ?? 0);
    const fundingTime = Number(frd.funding_time ?? Date.now());

    // Get mark price from merged ticker
    const tickerData = await this.publicGet(`/linear-swap-ex/market/detail/merged?contract_code=${exSym}`);
    const td = tickerData as Record<string, unknown>;
    const tick = td.tick as Record<string, unknown> | undefined;
    const markPrice = tick ? Number(tick.close ?? 0) : 0;

    return {
      exchangeId: this.exchangeId,
      canonicalSymbol,
      exchangeSymbol: exSym,
      markPrice,
      lastFundingRate: fundingRate,
      nextFundingTime: fundingTime + 8 * 3600_000,
    };
  }

  protected async fetchTradingRules(): Promise<TradingRule[]> {
    const data = await this.publicGet("/linear-swap-api/v1/swap_contract_info");
    const d = data as Record<string, unknown>;
    if (d.status !== "ok") return [];

    const list = d.data as Array<Record<string, unknown>> | undefined;
    if (!list) return [];

    const symbolSet = new Set(SYMBOLS);
    return list
      .filter((s) => symbolSet.has(HTX_REVERSE_MAP[String(s.contract_code)] ?? ""))
      .map((s) => {
        const code = String(s.contract_code);
        const canonical = HTX_REVERSE_MAP[code] ?? code;
        const contractSize = Number(s.contract_size ?? 1);
        const priceTick = Number(s.price_tick ?? 0.01);

        return {
          exchangeId: this.exchangeId,
          canonicalSymbol: canonical,
          exchangeSymbol: code,
          marketType: "perpetual" as const,
          minOrderSize: contractSize, // minimum 1 contract
          maxOrderSize: contractSize * 10000,
          minPriceIncrement: priceTick,
          minBaseAmountIncrement: contractSize,
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
