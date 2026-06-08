/**
 * Funding Accrual Engine Tests — Alpha Phase A4
 *
 * Acceptance criteria:
 *   perpetualLeg: side=short, notionalUsd=10000, fundingRate=0.0001
 *   → fundingAmountUsd = 1
 *   original: fundingCollectedUsd=50, spotPnl=100, perpPnl=-100
 *   → new fundingCollectedUsd=51, totalPnlUsd=51
 */

import { describe, expect, it } from "vitest";
import {
  accrueFunding,
  accrueFundingBatch,
  calculateFundingAmount,
  getNextFundingSettlementTime,
  isFundingSettlementDue,
} from "./fundingAccrualEngine";
import { createArbitragePosition } from "./arbitragePositionEngine";
import type { FundingAccrualInput } from "./fundingAccrualTypes";

// ─── Helper ──────────────────────────────────────────────

function makeShortPerpPosition(fundingCollected = 50) {
  const pos = createArbitragePosition({
    symbol: "BTC/USDT",
    spotLeg: {
      exchange: "Binance",
      symbol: "BTC/USDT",
      marketType: "spot",
      side: "long",
      quantity: 1,
      entryPrice: 10000,
    },
    perpetualLeg: {
      exchange: "Binance",
      symbol: "BTC/USDT",
      marketType: "perpetual",
      side: "short",
      quantity: 1,
      entryPrice: 10000,
    },
    fundingCollectedUsd: fundingCollected,
  });
  // Prices stay at 10000 so notional = 10000
  return pos;
}

function makeShortPerpPositionWithPnl(fundingCollected = 50) {
  const pos = makeShortPerpPosition(fundingCollected);
  return {
    ...pos,
    spotLeg: { ...pos.spotLeg, markPrice: 10100, notionalUsd: 10100, unrealizedPnlUsd: 100 },
    perpetualLeg: { ...pos.perpetualLeg, markPrice: 10100, notionalUsd: 10100, unrealizedPnlUsd: -100 },
    totalPnlUsd: 100 - 100 + fundingCollected,
  };
}

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  const pos = makeShortPerpPosition(50);
  const result = accrueFunding({
    position: pos,
    fundingRate: 0.0001,
    settledAt: 1700000000000,
  });

  it("fundingAmountUsd = notional * rate = 10000 * 0.0001 = 1 (short receives)", () => {
    expect(result.event.fundingAmountUsd).toBe(1);
  });

  it("fundingCollectedUsd becomes 50 + 1 = 51", () => {
    expect(result.updatedPosition.fundingCollectedUsd).toBe(51);
  });

  it("recorded notionalUsd in event is 10000", () => {
    expect(result.event.notionalUsd).toBe(10000);
  });

  it("event records correct metadata", () => {
    expect(result.event.positionId).toBe(pos.id);
    expect(result.event.symbol).toBe("BTC/USDT");
    expect(result.event.fundingRate).toBe(0.0001);
    expect(result.event.legType).toBe("perpetual");
    expect(result.event.side).toBe("short");
  });
});

// ─── calculateFundingAmount ──────────────────────────────

describe("calculateFundingAmount", () => {
  it("short perp + positive rate → receive (positive)", () => {
    const amount = calculateFundingAmount(10000, 0.0001, "short");
    expect(amount).toBe(1);
  });

  it("long perp + positive rate → pay (negative)", () => {
    const amount = calculateFundingAmount(10000, 0.0001, "long");
    expect(amount).toBe(-1);
  });

  it("short perp + negative rate → pay (negative)", () => {
    const amount = calculateFundingAmount(10000, -0.0001, "short");
    expect(amount).toBe(-1);
  });

  it("long perp + negative rate → receive (positive)", () => {
    const amount = calculateFundingAmount(10000, -0.0001, "long");
    expect(amount).toBe(1);
  });

  it("zero rate → zero amount", () => {
    expect(calculateFundingAmount(10000, 0, "short")).toBe(0);
    expect(calculateFundingAmount(10000, 0, "long")).toBeCloseTo(0);
  });
});

// ─── accrueFunding — direction rules ─────────────────────

describe("accrueFunding — direction rules", () => {
  it("short perp + positive funding → fundingCollectedUsd increases", () => {
    const pos = makeShortPerpPosition(0);
    const result = accrueFunding({ position: pos, fundingRate: 0.0001 });
    expect(result.updatedPosition.fundingCollectedUsd).toBeGreaterThan(pos.fundingCollectedUsd);
  });

  it("long perp + positive funding → fundingCollectedUsd decreases (pay)", () => {
    // Create a position where the perpetual leg is long (non-standard arb)
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "short", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "long", quantity: 1, entryPrice: 10000 },
      fundingCollectedUsd: 50,
    });
    const result = accrueFunding({ position: pos, fundingRate: 0.0001 });
    // Long pays: -10000 * 0.0001 = -1
    expect(result.event.fundingAmountUsd).toBe(-1);
    expect(result.updatedPosition.fundingCollectedUsd).toBe(49);
  });
});

// ─── Immutability ───────────────────────────────────────

describe("immutability", () => {
  it("accrueFunding does not mutate the original position", () => {
    const pos = makeShortPerpPosition(50);
    const originalFunding = pos.fundingCollectedUsd;
    accrueFunding({ position: pos, fundingRate: 0.0001 });
    expect(pos.fundingCollectedUsd).toBe(originalFunding);
  });
});

// ─── Batch Accrual ──────────────────────────────────────

describe("accrueFundingBatch", () => {
  it("applies multiple accruals sequentially", () => {
    const pos = makeShortPerpPosition(0);
    const inputs: Omit<FundingAccrualInput, "position">[] = [
      { fundingRate: 0.0001 },
      { fundingRate: 0.0002 },
      { fundingRate: 0.00015 },
    ];
    const result = accrueFundingBatch(pos, inputs);
    // 10000 * (0.0001 + 0.0002 + 0.00015) = 10000 * 0.00045 = 4.5
    expect(result.updatedPosition.fundingCollectedUsd).toBeCloseTo(4.5, 2);
  });

  it("returns the last event and final position", () => {
    const pos = makeShortPerpPosition(0);
    const inputs: Omit<FundingAccrualInput, "position">[] = [
      { fundingRate: 0.0001 },
      { fundingRate: 0.0002 },
    ];
    const result = accrueFundingBatch(pos, inputs);
    expect(result.event.fundingRate).toBe(0.0002);
  });
});

// ─── getNextFundingSettlementTime ───────────────────────

describe("getNextFundingSettlementTime", () => {
  it("01:00 → next is 08:00 same day", () => {
    // 2026-01-01 01:00 UTC
    const current = Date.UTC(2026, 0, 1, 1, 0, 0, 0);
    const next = getNextFundingSettlementTime(current, 8);
    const nextDate = new Date(next);
    expect(nextDate.getUTCHours()).toBe(8);
    expect(nextDate.getUTCDate()).toBe(1);
  });

  it("08:00 → next is 16:00 same day", () => {
    const current = Date.UTC(2026, 0, 1, 8, 0, 0, 0);
    const next = getNextFundingSettlementTime(current, 8);
    const nextDate = new Date(next);
    expect(nextDate.getUTCHours()).toBe(16);
    expect(nextDate.getUTCDate()).toBe(1);
  });

  it("16:00 → next is 00:00 next day", () => {
    const current = Date.UTC(2026, 0, 1, 16, 0, 0, 0);
    const next = getNextFundingSettlementTime(current, 8);
    const nextDate = new Date(next);
    expect(nextDate.getUTCHours()).toBe(0);
    expect(nextDate.getUTCDate()).toBe(2);
  });

  it("23:00 → next is 00:00 next day", () => {
    const current = Date.UTC(2026, 0, 1, 23, 0, 0, 0);
    const next = getNextFundingSettlementTime(current, 8);
    const nextDate = new Date(next);
    expect(nextDate.getUTCHours()).toBe(0);
    expect(nextDate.getUTCDate()).toBe(2);
  });

  it("default interval is 8 hours", () => {
    const current = Date.UTC(2026, 0, 1, 3, 0, 0, 0);
    const next = getNextFundingSettlementTime(current);
    const nextDate = new Date(next);
    expect(nextDate.getUTCHours()).toBe(8);
  });

  it("works with custom interval (4 hours)", () => {
    const current = Date.UTC(2026, 0, 1, 3, 0, 0, 0);
    const next = getNextFundingSettlementTime(current, 4);
    const nextDate = new Date(next);
    expect(nextDate.getUTCHours()).toBe(4);
  });
});

// ─── isFundingSettlementDue ─────────────────────────────

describe("isFundingSettlementDue", () => {
  it("returns false when less than 8 hours have passed", () => {
    const last = Date.UTC(2026, 0, 1, 0, 0, 0, 0);
    const now = Date.UTC(2026, 0, 1, 7, 59, 59, 999);
    expect(isFundingSettlementDue(last, now, 8)).toBe(false);
  });

  it("returns true when exactly 8 hours have passed", () => {
    const last = Date.UTC(2026, 0, 1, 0, 0, 0, 0);
    const now = Date.UTC(2026, 0, 1, 8, 0, 0, 0);
    expect(isFundingSettlementDue(last, now, 8)).toBe(true);
  });

  it("returns true when more than 8 hours have passed", () => {
    const last = Date.UTC(2026, 0, 1, 0, 0, 0, 0);
    const now = Date.UTC(2026, 0, 1, 12, 0, 0, 0);
    expect(isFundingSettlementDue(last, now, 8)).toBe(true);
  });

  it("default interval is 8 hours", () => {
    const last = Date.UTC(2026, 0, 1, 0, 0, 0, 0);
    const now = Date.UTC(2026, 0, 1, 8, 0, 0, 0);
    expect(isFundingSettlementDue(last, now)).toBe(true);
  });
});

// ─── totalPnlUsd includes funding ──────────────────────

describe("totalPnlUsd includes funding", () => {
  it("with price movement, PnL = spotPnl + perpPnl + fundingCollected after accrual", () => {
    const pos = makeShortPerpPositionWithPnl(10);
    const result = accrueFunding({ position: pos, fundingRate: 0.0001 });
    // notional = 10100, funding = 10100 * 0.0001 = 1.01
    const expectedFunding = 10 + 1.01;
    const expectedTotal = 100 + (-100) + expectedFunding;

    expect(result.updatedPosition.fundingCollectedUsd).toBeCloseTo(expectedFunding, 2);
    expect(result.updatedPosition.totalPnlUsd).toBeCloseTo(expectedTotal, 2);
  });
});
