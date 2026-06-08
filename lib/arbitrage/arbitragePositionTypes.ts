/**
 * Arbitrage Position Types — Alpha Phase A3
 *
 * Data models for recording and tracking a single funding
 * arbitrage position (spot leg + perpetual leg).
 *
 * Pure types — no logic.
 */

import type { ExchangeName } from "../exchanges/types";

// ─── Leg Type ────────────────────────────────────────────

export type ArbitrageLeg = {
  /** Exchange where this leg is held (e.g. "Binance"). */
  exchange: ExchangeName;

  /** Trading pair symbol (e.g. "BTC/USDT"). */
  symbol: string;

  /** Instrument type. */
  marketType: "spot" | "perpetual";

  /** Position direction. */
  side: "long" | "short";

  /** Quantity in base asset units (e.g. 1 BTC). */
  quantity: number;

  /** Entry price in quote currency. */
  entryPrice: number;

  /** Current mark / oracle price for unrealised PnL calculation. */
  markPrice: number;

  /** Notional value in USD (quantity * markPrice). */
  notionalUsd: number;

  /** Unrealised PnL in USD (mark - entry, directional). */
  unrealizedPnlUsd: number;
};

// ─── Position Status ─────────────────────────────────────

export type ArbitragePositionStatus = "open" | "closed";

// ─── Position ────────────────────────────────────────────

export type ArbitragePosition = {
  /** Unique position identifier. */
  id: string;

  /** Trading pair (e.g. "BTC/USDT"). */
  symbol: string;

  /** Whether the position is still open or has been closed. */
  status: ArbitragePositionStatus;

  /** Timestamp (ms) when the position was opened. */
  openedAt: number;

  /** Timestamp (ms) when the position was closed (undefined if open). */
  closedAt?: number;

  /** Spot leg of the arbitrage. */
  spotLeg: ArbitrageLeg;

  /** Perpetual leg of the arbitrage. */
  perpetualLeg: ArbitrageLeg;

  /** Cumulative funding payments collected in USD (entire position lifetime). */
  fundingCollectedUsd: number;

  /**
   * Total realised + unrealised PnL in USD.
   *
   * totalPnlUsd = spotLeg.unrealizedPnlUsd
   *             + perpetualLeg.unrealizedPnlUsd
   *             + fundingCollectedUsd
   */
  totalPnlUsd: number;

  /**
   * Dollar delta between the two legs (long notional - short notional).
   *
   * deltaUsd = 0 when the position is perfectly delta-neutral.
   */
  deltaUsd: number;

  /**
   * Delta as a percentage of the larger leg notional.
   *
   * deltaPercent = deltaUsd / max(spotNotional, perpNotional) * 100
   */
  deltaPercent: number;

  /** Expected net APY at entry (from Alpha-2). */
  entryNetApy?: number;

  /** Expected net APY at current prices (could differ from entry). */
  currentNetApy?: number;

  /** Optional metadata bag for extensibility. */
  metadata?: Record<string, unknown>;
};

// ─── Create Position Input ───────────────────────────────

export type CreatePositionInput = {
  id?: string;
  symbol: string;
  spotLeg: Omit<ArbitrageLeg, "unrealizedPnlUsd" | "notionalUsd"> & {
    markPrice?: number;
  };
  perpetualLeg: Omit<ArbitrageLeg, "unrealizedPnlUsd" | "notionalUsd"> & {
    markPrice?: number;
  };
  fundingCollectedUsd?: number;
  entryNetApy?: number;
  currentNetApy?: number;
  metadata?: Record<string, unknown>;
};

// ─── Close Position Input ────────────────────────────────

export type ClosePositionInput = {
  /** Close-out prices for each leg (overrides current markPrice). */
  spotClosePrice: number;
  perpClosePrice: number;
  /** Additional funding collected before close. */
  additionalFundingUsd?: number;
};
