/**
 * Funding Accrual Engine — Alpha Phase A4
 *
 * Simulates per-period funding settlement for a funding arbitrage position.
 *
 * Funding is only earned/paid on the perpetual leg.
 * The spot leg does not accrue funding.
 *
 * Rules:
 *   perpetual short + positive rate → receive (amount > 0)
 *   perpetual long  + positive rate → pay     (amount < 0)
 *
 * Pure functions — no side effects.
 */

import type { ArbitragePosition } from "./arbitragePositionTypes";
import type {
  FundingAccrualEvent,
  FundingAccrualInput,
  FundingAccrualResult,
} from "./fundingAccrualTypes";

// ─── Defaults ────────────────────────────────────────────

export const DEFAULT_FUNDING_INTERVAL_HOURS = 8;

// ─── Internal counter for event IDs ──────────────────────

let _eventSeq = 0;

function nextEventId(): string {
  _eventSeq += 1;
  return `acc-${String(_eventSeq).padStart(6, "0")}`;
}

// ─── Public API ──────────────────────────────────────────

/**
 * Calculate the funding payment amount for a single settlement period.
 *
 * A positive result means the position receives funding (short perpetual).
 * A negative result means the position pays funding (long perpetual).
 *
 * @param notionalUsd  - Notional value of the perpetual leg.
 * @param fundingRate  - Single-period funding rate (decimal, e.g. 0.0001).
 * @param side         - "short" → receive on positive rate; "long" → pay on positive rate.
 * @returns Funding amount in USD (signed).
 */
export function calculateFundingAmount(
  notionalUsd: number,
  fundingRate: number,
  side: "long" | "short",
): number {
  if (side === "short") {
    return notionalUsd * fundingRate;
  }
  // long
  return -(notionalUsd * fundingRate);
}

/**
 * Accrue one funding settlement onto a position.
 *
 * Returns both the generated event and a new position object
 * with updated fundingCollectedUsd and totalPnlUsd.
 *
 * The original position is NOT mutated.
 */
export function accrueFunding(input: FundingAccrualInput): FundingAccrualResult {
  const position = input.position;
  const legType = input.legType ?? "perpetual";
  const fundingIntervalHours = input.fundingIntervalHours ?? DEFAULT_FUNDING_INTERVAL_HOURS;
  const settledAt = input.settledAt ?? Date.now();

  // Determine which leg to use
  const leg = legType === "perpetual" ? position.perpetualLeg : position.spotLeg;

  const fundingAmountUsd = calculateFundingAmount(
    leg.notionalUsd,
    input.fundingRate,
    leg.side,
  );

  const event: FundingAccrualEvent = {
    id: nextEventId(),
    positionId: position.id,
    symbol: position.symbol,
    exchange: input.exchange ?? leg.exchange,
    fundingRate: input.fundingRate,
    fundingIntervalHours,
    notionalUsd: leg.notionalUsd,
    fundingAmountUsd,
    settledAt,
    legType,
    side: leg.side,
  };

  const newFundingCollected = position.fundingCollectedUsd + fundingAmountUsd;
  const newTotalPnl =
    position.spotLeg.unrealizedPnlUsd +
    position.perpetualLeg.unrealizedPnlUsd +
    newFundingCollected;

  const updatedPosition: ArbitragePosition = {
    ...position,
    fundingCollectedUsd: newFundingCollected,
    totalPnlUsd: newTotalPnl,
  };

  return { event, updatedPosition };
}

/**
 * Accrue multiple funding settlements in a batch.
 *
 * Each input is applied sequentially so that fundingCollectedUsd
 * accumulates across the batch.
 *
 * @param position  - Starting position.
 * @param inputs    - Array of accrual inputs (each with the same or different fundingRate).
 * @returns The final result after all inputs are applied.
 */
export function accrueFundingBatch(
  position: ArbitragePosition,
  inputs: Omit<FundingAccrualInput, "position">[],
): FundingAccrualResult {
  let currentPosition = position;
  let lastEvent: FundingAccrualEvent | null = null;

  for (const singleInput of inputs) {
    const result = accrueFunding({ ...singleInput, position: currentPosition });
    currentPosition = result.updatedPosition;
    lastEvent = result.event;
  }

  // Return the last event + final position; caller can collect events if needed
  return {
    event: lastEvent!,
    updatedPosition: currentPosition,
  };
}

/**
 * Compute the next funding settlement time boundary.
 *
 * Funding settles at UTC hour boundaries aligned to intervalHours.
 * e.g. intervalHours=8 → settlement at 00:00, 08:00, 16:00 UTC.
 */
export function getNextFundingSettlementTime(
  currentTime: number,
  intervalHours: number = DEFAULT_FUNDING_INTERVAL_HOURS,
): number {
  const date = new Date(currentTime);
  const utcHours = date.getUTCHours();
  const utcMinutes = date.getUTCMinutes();
  const utcSeconds = date.getUTCSeconds();
  const utcMs = date.getUTCMilliseconds();

  // Elapsed hours in the current cycle
  const hoursSinceLastSettlement = utcHours % intervalHours;

  // Time of the most recent settlement boundary
  const lastBoundary = new Date(date);
  lastBoundary.setUTCHours(utcHours - hoursSinceLastSettlement, 0, 0, 0);

  // Next = last boundary + intervalHours
  const next = new Date(lastBoundary);
  next.setUTCHours(lastBoundary.getUTCHours() + intervalHours);

  return next.getTime();
}

/**
 * Check whether a funding settlement is due.
 *
 * @param lastSettlementTime - Timestamp (ms) of the last settlement.
 * @param currentTime        - Current timestamp (ms).
 * @param intervalHours      - Settlement interval in hours (default 8).
 * @returns true if currentTime - lastSettlementTime >= intervalHours.
 */
export function isFundingSettlementDue(
  lastSettlementTime: number,
  currentTime: number,
  intervalHours: number = DEFAULT_FUNDING_INTERVAL_HOURS,
): boolean {
  const elapsedMs = currentTime - lastSettlementTime;
  const intervalMs = intervalHours * 60 * 60 * 1000;
  return elapsedMs >= intervalMs;
}
