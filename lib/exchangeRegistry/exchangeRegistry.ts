/**
 * Exchange Registry — Multi-Exchange Foundation
 *
 * In-memory registry for exchange capabilities, symbol mappings,
 * funding intervals, fee models, and health statuses.
 *
 * No real API calls — pure data + pure functions.
 */

import type {
  ExchangeCapability,
  ExchangeHealth,
  ExchangeId,
  FeeModel,
  FundingInterval,
  HealthStatus,
  MarketType,
  SymbolMapping,
} from "./exchangeRegistryTypes";

// ─── Default Exchanges ──────────────────────────────────

const DEFAULT_EXCHANGES: ExchangeId[] = [
  "binance", "bybit", "okx", "bitget", "gate", "hyperliquid",
];

const DEFAULT_CAPABILITIES: ExchangeCapability[] = [
  { exchangeId: "binance", supportsSpot: true, supportsPerpetual: true, supportsFutures: false, supportsFundingRate: true, supportsOpenInterest: true, supportsReduceOnly: true, supportsPostOnly: true, supportsTestnet: true, supportsMainnet: true, rateLimitPerMinute: 1200, maxLeverage: 125 },
  { exchangeId: "bybit", supportsSpot: true, supportsPerpetual: true, supportsFutures: false, supportsFundingRate: true, supportsOpenInterest: true, supportsReduceOnly: true, supportsPostOnly: true, supportsTestnet: true, supportsMainnet: true, rateLimitPerMinute: 600, maxLeverage: 100 },
  { exchangeId: "okx", supportsSpot: true, supportsPerpetual: true, supportsFutures: true, supportsFundingRate: true, supportsOpenInterest: true, supportsReduceOnly: true, supportsPostOnly: true, supportsTestnet: true, supportsMainnet: true, rateLimitPerMinute: 600, maxLeverage: 125 },
  { exchangeId: "bitget", supportsSpot: true, supportsPerpetual: true, supportsFutures: false, supportsFundingRate: true, supportsOpenInterest: true, supportsReduceOnly: true, supportsPostOnly: false, supportsTestnet: true, supportsMainnet: true, rateLimitPerMinute: 300, maxLeverage: 125 },
  { exchangeId: "gate", supportsSpot: true, supportsPerpetual: true, supportsFutures: true, supportsFundingRate: true, supportsOpenInterest: true, supportsReduceOnly: true, supportsPostOnly: true, supportsTestnet: true, supportsMainnet: true, rateLimitPerMinute: 300, maxLeverage: 100 },
  { exchangeId: "hyperliquid", supportsSpot: false, supportsPerpetual: true, supportsFutures: false, supportsFundingRate: true, supportsOpenInterest: true, supportsReduceOnly: true, supportsPostOnly: false, supportsTestnet: false, supportsMainnet: true, rateLimitPerMinute: 200, maxLeverage: 50 },
];

const DEFAULT_SYMBOL_MAPPINGS: Array<{ canonical: string; exchangeId: ExchangeId; exchangeSymbol: string; base: string; quote: string; market: MarketType }> = [
  { canonical: "BTCUSDT", exchangeId: "binance", exchangeSymbol: "BTCUSDT", base: "BTC", quote: "USDT", market: "perpetual" },
  { canonical: "BTCUSDT", exchangeId: "bybit", exchangeSymbol: "BTCUSDT", base: "BTC", quote: "USDT", market: "perpetual" },
  { canonical: "BTCUSDT", exchangeId: "okx", exchangeSymbol: "BTC-USDT-SWAP", base: "BTC", quote: "USDT", market: "perpetual" },
  { canonical: "BTCUSDT", exchangeId: "bitget", exchangeSymbol: "BTCUSDT", base: "BTC", quote: "USDT", market: "perpetual" },
  { canonical: "BTCUSDT", exchangeId: "gate", exchangeSymbol: "BTC_USDT", base: "BTC", quote: "USDT", market: "perpetual" },
  { canonical: "BTCUSDT", exchangeId: "hyperliquid", exchangeSymbol: "BTC", base: "BTC", quote: "USDC", market: "perpetual" },
  { canonical: "ETHUSDT", exchangeId: "binance", exchangeSymbol: "ETHUSDT", base: "ETH", quote: "USDT", market: "perpetual" },
  { canonical: "ETHUSDT", exchangeId: "bybit", exchangeSymbol: "ETHUSDT", base: "ETH", quote: "USDT", market: "perpetual" },
  { canonical: "ETHUSDT", exchangeId: "okx", exchangeSymbol: "ETH-USDT-SWAP", base: "ETH", quote: "USDT", market: "perpetual" },
  { canonical: "ETHUSDT", exchangeId: "bitget", exchangeSymbol: "ETHUSDT", base: "ETH", quote: "USDT", market: "perpetual" },
  { canonical: "ETHUSDT", exchangeId: "gate", exchangeSymbol: "ETH_USDT", base: "ETH", quote: "USDT", market: "perpetual" },
  { canonical: "ETHUSDT", exchangeId: "hyperliquid", exchangeSymbol: "ETH", base: "ETH", quote: "USDC", market: "perpetual" },
];

const DEFAULT_FUNDING_INTERVALS: FundingInterval[] = [
  { exchangeId: "binance", marketType: "perpetual", intervalHours: 8 },
  { exchangeId: "bybit", marketType: "perpetual", intervalHours: 8 },
  { exchangeId: "okx", marketType: "perpetual", intervalHours: 8 },
  { exchangeId: "bitget", marketType: "perpetual", intervalHours: 8 },
  { exchangeId: "gate", marketType: "perpetual", intervalHours: 8 },
  { exchangeId: "hyperliquid", marketType: "perpetual", intervalHours: 1 },
];

const DEFAULT_FEE_MODELS: FeeModel[] = [
  { exchangeId: "binance", makerFeePercent: 0.02, takerFeePercent: 0.04, fundingFeeSettlementHours: 8 },
  { exchangeId: "bybit", makerFeePercent: 0.01, takerFeePercent: 0.06, fundingFeeSettlementHours: 8 },
  { exchangeId: "okx", makerFeePercent: 0.02, takerFeePercent: 0.05, fundingFeeSettlementHours: 8 },
  { exchangeId: "bitget", makerFeePercent: 0.02, takerFeePercent: 0.04, fundingFeeSettlementHours: 8 },
  { exchangeId: "gate", makerFeePercent: 0.02, takerFeePercent: 0.05, fundingFeeSettlementHours: 8 },
  { exchangeId: "hyperliquid", makerFeePercent: 0.01, takerFeePercent: 0.04, fundingFeeSettlementHours: 1 },
];

// ─── Internal State ─────────────────────────────────────

const _exchanges: ExchangeId[] = [...DEFAULT_EXCHANGES];
const _capabilities = new Map<ExchangeId, ExchangeCapability>();
const _symbolMappings = new Map<string, Map<ExchangeId, SymbolMapping>>();
const _fundingIntervals = new Map<ExchangeId, FundingInterval>();
const _feeModels = new Map<ExchangeId, FeeModel>();
const _health = new Map<ExchangeId, ExchangeHealth>();

function init(): void {
  for (const cap of DEFAULT_CAPABILITIES) _capabilities.set(cap.exchangeId, cap);
  for (const s of DEFAULT_SYMBOL_MAPPINGS) {
    if (!_symbolMappings.has(s.canonical)) _symbolMappings.set(s.canonical, new Map());
    _symbolMappings.get(s.canonical)!.set(s.exchangeId, { canonicalSymbol: s.canonical, exchangeId: s.exchangeId, exchangeSymbol: s.exchangeSymbol, baseAsset: s.base, quoteAsset: s.quote, marketType: s.market });
  }
  for (const f of DEFAULT_FUNDING_INTERVALS) _fundingIntervals.set(f.exchangeId, f);
  for (const f of DEFAULT_FEE_MODELS) _feeModels.set(f.exchangeId, f);
  for (const e of DEFAULT_EXCHANGES) _health.set(e, { exchangeId: e, status: "healthy", lastCheckedAt: Date.now() });
}
init();

// ─── Exchange Lifecycle ────────────────────────────────

export function registerExchange(exchangeId: ExchangeId): void {
  if (_exchanges.includes(exchangeId)) return;
  _exchanges.push(exchangeId);
}

export function getExchanges(): ExchangeId[] {
  return [..._exchanges];
}

export function listSupportedExchanges(): ExchangeId[] {
  return [..._exchanges];
}

export function getExchange(exchangeId: ExchangeId): { exchangeId: ExchangeId } {
  if (!_exchanges.includes(exchangeId)) throw new Error(`Unknown exchange: ${exchangeId}`);
  return { exchangeId };
}

// ─── Capabilities ─────────────────────────────────────

export function registerCapabilities(cap: ExchangeCapability): void {
  _capabilities.set(cap.exchangeId, cap);
  if (!_exchanges.includes(cap.exchangeId)) _exchanges.push(cap.exchangeId);
}

export function getCapabilities(exchangeId: ExchangeId): ExchangeCapability {
  const cap = _capabilities.get(exchangeId);
  if (!cap) throw new Error(`No capabilities registered for exchange: ${exchangeId}`);
  return { ...cap };
}

// ─── Symbol Mapping ────────────────────────────────────

export function registerSymbolMapping(mapping: SymbolMapping): void {
  if (!_symbolMappings.has(mapping.canonicalSymbol)) {
    _symbolMappings.set(mapping.canonicalSymbol, new Map());
  }
  _symbolMappings.get(mapping.canonicalSymbol)!.set(mapping.exchangeId, mapping);
}

export function resolveCanonicalSymbol(exchangeId: ExchangeId, exchangeSymbol: string): string {
  for (const [, exchangeMap] of _symbolMappings) {
    const mapping = exchangeMap.get(exchangeId);
    if (mapping && mapping.exchangeSymbol === exchangeSymbol) {
      return mapping.canonicalSymbol;
    }
  }
  throw new Error(`No canonical symbol found for ${exchangeId}:${exchangeSymbol}`);
}

export function resolveExchangeSymbol(exchangeId: ExchangeId, canonicalSymbol: string): string {
  const exchangeMap = _symbolMappings.get(canonicalSymbol);
  if (!exchangeMap) throw new Error(`No mappings for canonical symbol: ${canonicalSymbol}`);
  const mapping = exchangeMap.get(exchangeId);
  if (!mapping) throw new Error(`No mapping for ${exchangeId}:${canonicalSymbol}`);
  return mapping.exchangeSymbol;
}

export function getSymbolMapping(exchangeId: ExchangeId, canonicalSymbol: string): SymbolMapping {
  const exchangeMap = _symbolMappings.get(canonicalSymbol);
  if (!exchangeMap) throw new Error(`No mappings for canonical symbol: ${canonicalSymbol}`);
  const mapping = exchangeMap.get(exchangeId);
  if (!mapping) throw new Error(`No mapping for ${exchangeId}:${canonicalSymbol}`);
  return { ...mapping };
}

// ─── Funding Interval ─────────────────────────────────

export function registerFundingInterval(interval: FundingInterval): void {
  _fundingIntervals.set(interval.exchangeId, interval);
}

export function getFundingInterval(exchangeId: ExchangeId): FundingInterval {
  const f = _fundingIntervals.get(exchangeId);
  if (!f) throw new Error(`No funding interval for exchange: ${exchangeId}`);
  return { ...f };
}

// ─── Fee Model ────────────────────────────────────────

export function registerFeeModel(fee: FeeModel): void {
  _feeModels.set(fee.exchangeId, fee);
}

export function getFeeModel(exchangeId: ExchangeId): FeeModel {
  const f = _feeModels.get(exchangeId);
  if (!f) throw new Error(`No fee model for exchange: ${exchangeId}`);
  return { ...f };
}

// ─── Health ───────────────────────────────────────────

export function updateExchangeHealth(exchangeId: ExchangeId, status: HealthStatus, latencyMs?: number): void {
  _health.set(exchangeId, { exchangeId, status, latencyMs, lastCheckedAt: Date.now() });
}

export function getExchangeHealth(exchangeId: ExchangeId): ExchangeHealth {
  const h = _health.get(exchangeId);
  if (!h) throw new Error(`No health record for exchange: ${exchangeId}`);
  return { ...h };
}

// ─── Reset (for testing) ─────────────────────────────

export function _resetRegistry(): void {
  _exchanges.length = 0;
  _exchanges.push(...DEFAULT_EXCHANGES);
  _capabilities.clear();
  _symbolMappings.clear();
  _fundingIntervals.clear();
  _feeModels.clear();
  _health.clear();
  init();
}
