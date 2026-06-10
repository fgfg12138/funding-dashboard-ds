/**
 * Exchange Registry Types — Multi-Exchange Foundation
 *
 * Defines the types for a multi-exchange abstraction layer.
 * No real API calls — pure types and data structures.
 */

// ─── Identifiers ───────────────────────────────────────

export type ExchangeId = string;

export type MarketType = "spot" | "perpetual" | "futures";

// ─── Exchange Capability ───────────────────────────────

export type ExchangeCapability = {
  /** Exchange identifier (e.g. "binance", "bybit", "okx"). */
  exchangeId: ExchangeId;
  /** Whether spot trading is supported. */
  supportsSpot: boolean;
  /** Whether perpetual contracts are supported. */
  supportsPerpetual: boolean;
  /** Whether traditional futures are supported. */
  supportsFutures: boolean;
  /** Whether funding rate data is available. */
  supportsFundingRate: boolean;
  /** Whether open interest data is available. */
  supportsOpenInterest: boolean;
  /** Whether reduce-only orders are supported. */
  supportsReduceOnly: boolean;
  /** Whether post-only orders are supported. */
  supportsPostOnly: boolean;
  /** Whether a testnet environment is available. */
  supportsTestnet: boolean;
  /** Whether mainnet is available. */
  supportsMainnet: boolean;
  /** Rate limit in requests per minute. */
  rateLimitPerMinute: number;
  /** Maximum leverage (undefined if unknown). */
  maxLeverage?: number;
};

// ─── Symbol Mapping ────────────────────────────────────

export type SymbolMapping = {
  /** Canonical symbol (e.g. "BTCUSDT"). */
  canonicalSymbol: string;
  /** Exchange identifier. */
  exchangeId: ExchangeId;
  /** Exchange-specific symbol (e.g. "BTC-USDT-SWAP", "BTC_USDT"). */
  exchangeSymbol: string;
  /** Base asset (e.g. "BTC"). */
  baseAsset: string;
  /** Quote asset (e.g. "USDT"). */
  quoteAsset: string;
  /** Market type. */
  marketType: MarketType;
};

// ─── Funding Interval ─────────────────────────────────

export type FundingInterval = {
  /** Exchange identifier. */
  exchangeId: ExchangeId;
  /** Market type. */
  marketType: MarketType;
  /** Hours between funding settlements. */
  intervalHours: number;
};

// ─── Fee Model ─────────────────────────────────────────

export type FeeModel = {
  /** Exchange identifier. */
  exchangeId: ExchangeId;
  /** Maker fee as a percentage (e.g. 0.01 = 0.01%). */
  makerFeePercent: number;
  /** Taker fee as a percentage (e.g. 0.04 = 0.04%). */
  takerFeePercent: number;
  /** Funding fee settlement hours (may differ from interval). */
  fundingFeeSettlementHours: number;
};

// ─── Exchange Health ───────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "down";

export type ExchangeHealth = {
  /** Exchange identifier. */
  exchangeId: ExchangeId;
  /** Current health status. */
  status: HealthStatus;
  /** Optional latency in ms. */
  latencyMs?: number;
  /** Timestamp when health was last checked. */
  lastCheckedAt: number;
};

// ─── Registry ──────────────────────────────────────────

export type ExchangeRegistry = {
  /** All registered exchange IDs. */
  exchanges: ExchangeId[];
  /** Capabilities keyed by exchange ID. */
  capabilities: Map<ExchangeId, ExchangeCapability>;
  /** Symbol mappings (canonical → exchange → mapping). */
  symbolMappings: Map<string, Map<ExchangeId, SymbolMapping>>;
  /** Funding intervals keyed by exchange ID. */
  fundingIntervals: Map<ExchangeId, FundingInterval>;
  /** Fee models keyed by exchange ID. */
  feeModels: Map<ExchangeId, FeeModel>;
  /** Health statuses keyed by exchange ID. */
  health: Map<ExchangeId, ExchangeHealth>;
};
