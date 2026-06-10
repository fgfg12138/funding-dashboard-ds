/**
 * Spread Paper Trader Types — Cross-Exchange Paper Trader
 *
 * Defines the position, event, state, and config types for
 * simulating cross-exchange funding spread arbitrage.
 */

// ─── Paper Leg ─────────────────────────────────────────

export type SpreadPaperLeg = {
  /** Exchange identifier. */
  exchangeId: string;
  /** Position side. */
  side: "long" | "short";
  /** Current funding rate (decimal). */
  fundingRate: number;
  /** Current mark price. */
  markPrice: number;
  /** Notional position size in USD. */
  notionalUsd: number;
  /** Total funding collected on this leg. */
  fundingCollectedUsd: number;
  /** Unrealized PnL from price change. */
  unrealizedPnlUsd: number;
};

// ─── Paper Position ────────────────────────────────────

export type SpreadPaperPositionStatus = "open" | "closed";

export type SpreadPaperPosition = {
  /** Unique position ID. */
  id: string;
  /** Canonical symbol (e.g. "BTCUSDT"). */
  canonicalSymbol: string;
  /** Current status. */
  status: SpreadPaperPositionStatus;
  /** Timestamp (ms) when position was opened. */
  openedAt: number;
  /** Timestamp (ms) when position was closed (undefined while open). */
  closedAt?: number;
  /** Exchange on the short side. */
  shortExchangeId: string;
  /** Exchange on the long side. */
  longExchangeId: string;
  /** Short leg details. */
  shortLeg: SpreadPaperLeg;
  /** Long leg details. */
  longLeg: SpreadPaperLeg;
  /** Total position size in USD (split across two legs). */
  positionSizeUsd: number;
  /** Spread rate when position was opened. */
  entrySpreadRate: number;
  /** Current spread rate. */
  currentSpreadRate: number;
  /** Total funding collected across both legs. */
  fundingCollectedUsd: number;
  /** Trading PnL from price changes. */
  tradingPnlUsd: number;
  /** Total PnL (funding + trading). */
  totalPnlUsd: number;
  /** Hours the position has been held. */
  holdingHours: number;
  /** Optional metadata (e.g. exit reason). */
  metadata?: Record<string, unknown>;
};

// ─── Funding Event ────────────────────────────────────

export type SpreadFundingEvent = {
  /** Position ID. */
  positionId: string;
  /** Exchange that paid/received funding. */
  exchangeId: string;
  /** Canonical symbol. */
  canonicalSymbol: string;
  /** Position side. */
  side: "long" | "short";
  /** Funding rate at time of settlement. */
  fundingRate: number;
  /** Amount in USD (positive = received, negative = paid). */
  amountUsd: number;
  /** Timestamp (ms) when funding settled. */
  occurredAt: number;
};

// ─── Trader State ──────────────────────────────────────

export type SpreadPaperTraderState = {
  /** Currently open positions. */
  openPositions: SpreadPaperPosition[];
  /** Historically closed positions. */
  closedPositions: SpreadPaperPosition[];
  /** All funding events. */
  fundingEvents: SpreadFundingEvent[];
  /** Current simulated time in ms. */
  currentTime: number;
  /** Total capital allocated to the paper trader. */
  totalCapitalUsd: number;
};

// ─── Config ────────────────────────────────────────────

export type SpreadPaperTraderConfig = {
  /** Total capital available in USD. */
  totalCapitalUsd: number;
  /** Maximum number of concurrent open positions. */
  maxOpenPositions: number;
  /** Position size per opportunity in USD. */
  positionSizeUsd: number;
  /** Minimum net spread APY to open a position. */
  minNetSpreadApy: number;
  /** Maximum holding hours before auto-close. */
  maxHoldingHours: number;
  /** Spread rate threshold to exit (current < entry × this ratio). */
  exitSpreadRateThreshold: number;
  /** Take-profit per position in USD (optional). */
  takeProfitUsd?: number;
  /** Stop-loss per position in USD (optional). */
  stopLossUsd?: number;
  /** Reserve ratio (0-1) for unallocated capital. */
  reserveRatio: number;
};

export const DEFAULT_PAPER_TRADER_CONFIG: SpreadPaperTraderConfig = {
  totalCapitalUsd: 1000,
  maxOpenPositions: 3,
  positionSizeUsd: 100,
  minNetSpreadApy: 2,
  maxHoldingHours: 24,
  exitSpreadRateThreshold: 0.5,
  takeProfitUsd: 5,
  stopLossUsd: 2,
  reserveRatio: 0.3,
};
