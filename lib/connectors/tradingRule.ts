/**
 * Trading Rule — Multi-Exchange Connector Spec
 *
 * Represents exchange-imposed trading limits for a symbol.
 * Pure types + JSON serialization — no external dependencies.
 */

import type { ExchangeId, MarketType } from "../exchangeRegistry/exchangeRegistryTypes";

// ─── Types ─────────────────────────────────────────────

export type TradingRule = {
  /** Exchange identifier. */
  exchangeId: ExchangeId;
  /** Canonical symbol (e.g. "BTCUSDT"). */
  canonicalSymbol: string;
  /** Exchange-specific symbol (e.g. "BTC-USDT-SWAP"). */
  exchangeSymbol: string;
  /** Market type. */
  marketType: MarketType;
  /** Minimum order size in base asset. */
  minOrderSize: number;
  /** Maximum order size in base asset (undefined if unknown). */
  maxOrderSize?: number;
  /** Minimum price increment (tick size). */
  minPriceIncrement: number;
  /** Minimum base amount increment (step size). */
  minBaseAmountIncrement: number;
  /** Minimum notional value in quote asset. */
  minNotional: number;
  /** Whether market orders are supported. */
  supportsMarketOrder: boolean;
  /** Whether limit orders are supported. */
  supportsLimitOrder: boolean;
  /** Whether post-only orders are supported. */
  supportsPostOnly: boolean;
  /** Whether reduce-only orders are supported. */
  supportsReduceOnly: boolean;
  /** Collateral token for margin/futures (e.g. "USDT"). */
  collateralToken?: string;
};

// ─── JSON Serialization ───────────────────────────────

export function toJSONTradingRule(rule: TradingRule): Record<string, unknown> {
  return { ...rule };
}

export function fromJSONTradingRule(json: Record<string, unknown>): TradingRule {
  return {
    exchangeId: String(json.exchangeId),
    canonicalSymbol: String(json.canonicalSymbol),
    exchangeSymbol: String(json.exchangeSymbol),
    marketType: String(json.marketType) as MarketType,
    minOrderSize: Number(json.minOrderSize),
    maxOrderSize: json.maxOrderSize !== undefined ? Number(json.maxOrderSize) : undefined,
    minPriceIncrement: Number(json.minPriceIncrement),
    minBaseAmountIncrement: Number(json.minBaseAmountIncrement),
    minNotional: Number(json.minNotional),
    supportsMarketOrder: Boolean(json.supportsMarketOrder),
    supportsLimitOrder: Boolean(json.supportsLimitOrder),
    supportsPostOnly: Boolean(json.supportsPostOnly),
    supportsReduceOnly: Boolean(json.supportsReduceOnly),
    collateralToken: json.collateralToken !== undefined ? String(json.collateralToken) : undefined,
  };
}
