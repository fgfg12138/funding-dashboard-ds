/**
 * Arbitrage Position Engine — Alpha Phase A3
 *
 * Pure functions for managing a funding arbitrage position
 * (long spot + short perpetual or vice versa).
 *
 * No side effects — does not execute trades.
 */

import type {
  ArbitrageLeg,
  ArbitragePosition,
  ClosePositionInput,
  CreatePositionInput,
} from "./arbitragePositionTypes";

// ─── Helpers ─────────────────────────────────────────────

let _nextId = 1;
function generateId(): string {
  return `pos-${String(_nextId++).padStart(6, "0")}`;
}

function calcLegUnrealizedPnl(leg: ArbitrageLeg): number {
  if (leg.side === "long") {
    return (leg.markPrice - leg.entryPrice) * leg.quantity;
  }
  // short
  return (leg.entryPrice - leg.markPrice) * leg.quantity;
}

function calcNotional(quantity: number, price: number): number {
  return quantity * price;
}

/**
 * Build an ArbitrageLeg from partial input.
 * Infers notionalUsd and unrealizedPnlUsd.
 */
function buildLeg(
  input: CreatePositionInput["spotLeg"] | CreatePositionInput["perpetualLeg"],
  defaultMarkPrice: number,
): ArbitrageLeg {
  const markPrice = input.markPrice ?? defaultMarkPrice;
  const quantity = input.quantity;
  const notionalUsd = calcNotional(quantity, markPrice);

  const leg: ArbitrageLeg = {
    exchange: input.exchange,
    symbol: input.symbol,
    marketType: input.marketType,
    side: input.side,
    quantity: input.quantity,
    entryPrice: input.entryPrice,
    markPrice,
    notionalUsd,
    unrealizedPnlUsd: 0, // computed on build
  };

  leg.unrealizedPnlUsd = calcLegUnrealizedPnl(leg);
  return leg;
}

/**
 * Recalculate notional + unrealised PnL for a single leg given a new price.
 */
function recalcLeg(leg: ArbitrageLeg, newPrice: number): ArbitrageLeg {
  return {
    ...leg,
    markPrice: newPrice,
    notionalUsd: calcNotional(leg.quantity, newPrice),
    unrealizedPnlUsd: leg.side === "long"
      ? (newPrice - leg.entryPrice) * leg.quantity
      : (leg.entryPrice - newPrice) * leg.quantity,
  };
}

/**
 * Calculate delta metrics for a position.
 */
function calcDelta(
  spotNotional: number,
  perpNotional: number,
  spotSide: "long" | "short",
  perpSide: "long" | "short",
): { deltaUsd: number; deltaPercent: number } {
  // Long contributes +notional, short contributes -notional
  const spotSigned = spotSide === "long" ? spotNotional : -spotNotional;
  const perpSigned = perpSide === "long" ? perpNotional : -perpNotional;
  const deltaUsd = spotSigned + perpSigned;

  const maxNotional = Math.max(spotNotional, perpNotional);
  const deltaPercent = maxNotional > 0 ? (deltaUsd / maxNotional) * 100 : 0;

  return { deltaUsd, deltaPercent };
}

// ─── Public API ──────────────────────────────────────────

/**
 * Create a new arbitrage position from an input descriptor.
 *
 * Automatically computes notional values, unrealised PnL,
 * delta, and totalPnlUsd.
 */
export function createArbitragePosition(input: CreatePositionInput): ArbitragePosition {
  const spotLeg = buildLeg(input.spotLeg, input.spotLeg.entryPrice);
  const perpetualLeg = buildLeg(input.perpetualLeg, input.perpetualLeg.entryPrice);
  const fundingCollectedUsd = input.fundingCollectedUsd ?? 0;

  const { deltaUsd, deltaPercent } = calcDelta(
    spotLeg.notionalUsd,
    perpetualLeg.notionalUsd,
    spotLeg.side,
    perpetualLeg.side,
  );

  const totalPnlUsd = spotLeg.unrealizedPnlUsd + perpetualLeg.unrealizedPnlUsd + fundingCollectedUsd;

  const now = Date.now();

  return {
    id: input.id ?? generateId(),
    symbol: input.symbol,
    status: "open",
    openedAt: now,
    spotLeg,
    perpetualLeg,
    fundingCollectedUsd,
    totalPnlUsd,
    deltaUsd,
    deltaPercent,
    entryNetApy: input.entryNetApy,
    currentNetApy: input.currentNetApy,
    metadata: input.metadata,
  };
}

/**
 * Update a position's leg mark prices and recalculate everything.
 *
 * @returns A new position object with updated values (immutable pattern).
 */
export function updateArbitragePosition(
  position: ArbitragePosition,
  marketPrices: {
    spotPrice?: number;
    perpPrice?: number;
  },
): ArbitragePosition {
  const spotPrice = marketPrices.spotPrice ?? position.spotLeg.markPrice;
  const perpPrice = marketPrices.perpPrice ?? position.perpetualLeg.markPrice;

  const updatedSpot = recalcLeg(position.spotLeg, spotPrice);
  const updatedPerp = recalcLeg(position.perpetualLeg, perpPrice);
  const fundingCollectedUsd = position.fundingCollectedUsd;

  const { deltaUsd, deltaPercent } = calcDelta(
    updatedSpot.notionalUsd,
    updatedPerp.notionalUsd,
    updatedSpot.side,
    updatedPerp.side,
  );

  const totalPnlUsd = updatedSpot.unrealizedPnlUsd + updatedPerp.unrealizedPnlUsd + fundingCollectedUsd;

  return {
    ...position,
    spotLeg: updatedSpot,
    perpetualLeg: updatedPerp,
    fundingCollectedUsd,
    totalPnlUsd,
    deltaUsd,
    deltaPercent,
  };
}

/**
 * Calculate the current dollar delta of a position.
 */
export function calculatePositionDelta(position: ArbitragePosition): {
  deltaUsd: number;
  deltaPercent: number;
} {
  return calcDelta(
    position.spotLeg.notionalUsd,
    position.perpetualLeg.notionalUsd,
    position.spotLeg.side,
    position.perpetualLeg.side,
  );
}

/**
 * Calculate the current total PnL of a position.
 */
export function calculatePositionPnl(position: ArbitragePosition): number {
  return (
    position.spotLeg.unrealizedPnlUsd +
    position.perpetualLeg.unrealizedPnlUsd +
    position.fundingCollectedUsd
  );
}

/**
 * Close an open position.
 *
 * Overrides leg mark prices with close prices, recalculates final PnL,
 * sets status to "closed" and records closedAt.
 */
export function closeArbitragePosition(
  position: ArbitragePosition,
  close: ClosePositionInput,
): ArbitragePosition {
  if (position.status === "closed") {
    throw new Error(`Position ${position.id} is already closed.`);
  }

  const additionalFunding = close.additionalFundingUsd ?? 0;
  const totalFunding = position.fundingCollectedUsd + additionalFunding;

  const closedSpot = recalcLeg(position.spotLeg, close.spotClosePrice);
  const closedPerp = recalcLeg(position.perpetualLeg, close.perpClosePrice);

  const { deltaUsd, deltaPercent } = calcDelta(
    closedSpot.notionalUsd,
    closedPerp.notionalUsd,
    closedSpot.side,
    closedPerp.side,
  );

  const totalPnlUsd = closedSpot.unrealizedPnlUsd + closedPerp.unrealizedPnlUsd + totalFunding;

  return {
    ...position,
    status: "closed",
    closedAt: Date.now(),
    spotLeg: closedSpot,
    perpetualLeg: closedPerp,
    fundingCollectedUsd: totalFunding,
    totalPnlUsd,
    deltaUsd,
    deltaPercent,
  };
}
