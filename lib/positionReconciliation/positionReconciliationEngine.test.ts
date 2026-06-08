/**
 * Position Reconciliation Engine Tests — Beta Phase 4
 *
 * Acceptance criteria:
 *   Local BTCUSDT: Binance, short, qty=1, entry=100000, mark=100000
 *   Exchange BTCUSDT: Binance, short, qty=1, entry=100000, mark=100000
 *   → status=matched, matchedCount=1, mismatchCount=0
 */

import { describe, expect, it } from "vitest";
import {
  calculateExchangeDelta,
  calculatePriceDiff,
  calculateQuantityDiff,
  comparePositionPair,
  matchLocalToExchangePosition,
  reconcilePositions,
} from "./positionReconciliationEngine";
import type { AccountPosition } from "../accountSync/accountSyncTypes";
import type { ArbitragePosition, ArbitrageLeg } from "../arbitrage/arbitragePositionTypes";

// ─── Helpers ─────────────────────────────────────────────

function makeLeg(overrides?: Partial<ArbitrageLeg>): ArbitrageLeg {
  return {
    exchange: "Binance",
    symbol: "BTCUSDT",
    marketType: "perpetual",
    side: "short",
    quantity: 1,
    entryPrice: 100_000,
    markPrice: 100_000,
    notionalUsd: 100_000,
    unrealizedPnlUsd: 0,
    ...overrides,
  };
}

function makeLocalPosition(overrides?: Partial<ArbitragePosition>): ArbitragePosition {
  return {
    id: "pos-local-btc",
    symbol: "BTCUSDT",
    status: "open",
    openedAt: 100_000,
    spotLeg: makeLeg({ marketType: "spot", side: "long", notionalUsd: 100_000 }),
    perpetualLeg: makeLeg({ marketType: "perpetual", side: "short", notionalUsd: 100_000 }),
    fundingCollectedUsd: 0,
    totalPnlUsd: 0,
    deltaUsd: -100_000,  // short 1 BTC @ 100k = -100k delta
    deltaPercent: -100,
    ...overrides,
  };
}

function makeExchangePosition(overrides?: Partial<AccountPosition>): AccountPosition {
  return {
    exchange: "binance",
    symbol: "BTCUSDT",
    side: "short",
    quantity: 1,
    entryPrice: 100_000,
    markPrice: 100_000,
    updatedAt: Date.now(),
    ...overrides,
  };
}

const defaultConfig = {
  quantityTolerancePercent: 0.5,
  priceTolerancePercent: 1,
  deltaToleranceUsd: 100,
};

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  it("perfect match returns matched with correct counts", () => {
    const local = makeLocalPosition();
    const exchange = makeExchangePosition();

    const report = reconcilePositions([local], [exchange]);

    expect(report.items.length).toBe(1);
    expect(report.items[0].status).toBe("matched");
    expect(report.matchedCount).toBe(1);
    expect(report.mismatchCount).toBe(0);
    expect(report.highSeverityCount).toBe(0);
  });
});

// ─── Missing on Exchange ───────────────────────────────

describe("missing_on_exchange", () => {
  it("local position with no exchange match", () => {
    const local = makeLocalPosition();
    const report = reconcilePositions([local], []);

    expect(report.items.length).toBe(1);
    expect(report.items[0].status).toBe("missing_on_exchange");
    expect(report.items[0].severity).toBe("high");
    expect(report.mismatchCount).toBe(1);
  });
});

// ─── Missing Locally ──────────────────────────────────

describe("missing_locally", () => {
  it("exchange position with no local match", () => {
    const exchange = makeExchangePosition();
    const report = reconcilePositions([], [exchange]);

    expect(report.items.length).toBe(1);
    expect(report.items[0].status).toBe("missing_locally");
    expect(report.items[0].severity).toBe("high");
    expect(report.mismatchCount).toBe(1);
  });
});

// ─── Side Mismatch ────────────────────────────────────

describe("side_mismatch", () => {
  it("detects different sides", () => {
    const local = makeLocalPosition({ perpetualLeg: makeLeg({ side: "short" }) });
    const exchange = makeExchangePosition({ side: "long" });

    const item = comparePositionPair(local, exchange, defaultConfig);
    expect(item.status).toBe("side_mismatch");
    expect(item.severity).toBe("high");
  });
});

// ─── Quantity Mismatch ────────────────────────────────

describe("quantity_mismatch", () => {
  it("detects quantity above tolerance", () => {
    const local = makeLocalPosition({ perpetualLeg: makeLeg({ quantity: 1 }) });
    const exchange = makeExchangePosition({ quantity: 1.1 }); // 10% diff > 0.5% tolerance

    const item = comparePositionPair(local, exchange, defaultConfig);
    expect(item.status).toBe("quantity_mismatch");
    expect(item.severity).toBe("medium");
  });

  it("within tolerance does not trigger mismatch", () => {
    const local = makeLocalPosition({ perpetualLeg: makeLeg({ quantity: 1 }) });
    const exchange = makeExchangePosition({ quantity: 1.003 }); // 0.3% diff < 0.5% tolerance

    const item = comparePositionPair(local, exchange, defaultConfig);
    expect(item.status).not.toBe("quantity_mismatch");
  });
});

// ─── Price Mismatch ──────────────────────────────────

describe("price_mismatch", () => {
  it("detects price above tolerance", () => {
    const local = makeLocalPosition({ perpetualLeg: makeLeg({ entryPrice: 100_000 }) });
    const exchange = makeExchangePosition({ entryPrice: 102_000 }); // 2% diff > 1% tolerance

    const item = comparePositionPair(local, exchange, defaultConfig);
    expect(item.status).toBe("price_mismatch");
    expect(item.severity).toBe("low");
  });

  it("within tolerance does not trigger mismatch", () => {
    const local = makeLocalPosition({ perpetualLeg: makeLeg({ entryPrice: 100_000 }) });
    const exchange = makeExchangePosition({ entryPrice: 100_500 }); // 0.5% diff < 1% tolerance

    const item = comparePositionPair(local, exchange, defaultConfig);
    expect(item.status).not.toBe("price_mismatch");
  });
});

// ─── Delta Mismatch ─────────────────────────────────

describe("delta_mismatch", () => {
  it("detects delta above tolerance", () => {
    // Local: deltaUsd = 0 (explicit override), short 1 BTC @ 100k
    const local = makeLocalPosition({
      deltaUsd: 0,
    });
    // Exchange: short, qty=1 @ 100000 → delta = -100000
    const exchange = makeExchangePosition({ side: "short", quantity: 1, entryPrice: 100_000, markPrice: 100_000 });

    const item = comparePositionPair(local, exchange, defaultConfig);
    expect(item.status).toBe("delta_mismatch");
    expect(item.severity).toBe("medium");
  });

  it("within tolerance does not trigger mismatch", () => {
    const local = makeLocalPosition({
      deltaUsd: -100_000,
      perpetualLeg: makeLeg({ side: "short", quantity: 1, markPrice: 100_000 }),
    });
    const exchange = makeExchangePosition({ side: "short", quantity: 1, markPrice: 100_000 });

    const item = comparePositionPair(local, exchange, defaultConfig);
    expect(item.status).not.toBe("delta_mismatch");
  });
});

// ─── calculateQuantityDiff ──────────────────────────

describe("calculateQuantityDiff", () => {
  it("0% when equal", () => {
    expect(calculateQuantityDiff(1, 1)).toBe(0);
  });

  it("10% when 1 vs 1.1", () => {
    expect(calculateQuantityDiff(1, 1.1)).toBeCloseTo(10, 1);
  });
});

// ─── calculatePriceDiff ─────────────────────────────

describe("calculatePriceDiff", () => {
  it("0% when equal", () => {
    expect(calculatePriceDiff(100_000, 100_000)).toBe(0);
  });

  it("2% when 100k vs 102k", () => {
    expect(calculatePriceDiff(100_000, 102_000)).toBeCloseTo(2, 1);
  });
});

// ─── calculateExchangeDelta ─────────────────────────

describe("calculateExchangeDelta", () => {
  it("long = positive notional", () => {
    const pos: AccountPosition = { exchange: "binance", symbol: "BTCUSDT", side: "long", quantity: 2, entryPrice: 100_000, markPrice: 100_000, updatedAt: 0 };
    expect(calculateExchangeDelta(pos)).toBe(200_000);
  });

  it("short = negative notional", () => {
    const pos: AccountPosition = { exchange: "binance", symbol: "BTCUSDT", side: "short", quantity: 1, entryPrice: 100_000, markPrice: 100_000, updatedAt: 0 };
    expect(calculateExchangeDelta(pos)).toBe(-100_000);
  });

  it("uses entryPrice when markPrice is missing", () => {
    const pos: AccountPosition = { exchange: "binance", symbol: "BTCUSDT", side: "long", quantity: 1, entryPrice: 50_000, updatedAt: 0 };
    expect(calculateExchangeDelta(pos)).toBe(50_000);
  });
});

// ─── matchLocalToExchangePosition ──────────────────

describe("matchLocalToExchangePosition", () => {
  it("matches by exchange + symbol", () => {
    const local = makeLocalPosition({ perpetualLeg: makeLeg({ exchange: "Binance" }) });
    const exchangePos = makeExchangePosition({ exchange: "binance" });

    const match = matchLocalToExchangePosition(local, [exchangePos]);
    expect(match).toBeDefined();
    expect(match!.symbol).toBe("BTCUSDT");
  });

  it("returns undefined when no match", () => {
    const local = makeLocalPosition({ perpetualLeg: makeLeg({ exchange: "Binance" }) });
    const exchangePos = makeExchangePosition({ exchange: "bybit" });

    const match = matchLocalToExchangePosition(local, [exchangePos]);
    expect(match).toBeUndefined();
  });
});

// ─── Mixed Report ─────────────────────────────────

describe("mixed positions report", () => {
  it("correctly counts matched, missing, and mismatched", () => {
    const localA = makeLocalPosition({ id: "pos-a", symbol: "BTCUSDT" });
    const localB = makeLocalPosition({
      id: "pos-b",
      symbol: "ETHUSDT",
      perpetualLeg: makeLeg({ symbol: "ETHUSDT", exchange: "Binance" }),
    });

    const exchangeA = makeExchangePosition({ exchange: "binance", symbol: "BTCUSDT" });
    // exchangeB exists but with different side
    const exchangeB = makeExchangePosition({ exchange: "binance", symbol: "ETHUSDT", side: "long" });

    const report = reconcilePositions([localA, localB], [exchangeA, exchangeB]);

    // BTCUSDT → matched, ETHUSDT → side_mismatch
    expect(report.items.length).toBe(2);
    expect(report.matchedCount).toBe(1);
    expect(report.mismatchCount).toBe(1);
    expect(report.highSeverityCount).toBe(1); // side_mismatch is high
  });
});

// ─── Tolerance Config ──────────────────────────────

describe("tolerance config", () => {
  it("custom tolerance accepts larger quantity diff", () => {
    const local = makeLocalPosition({ perpetualLeg: makeLeg({ quantity: 1 }) });
    const exchange = makeExchangePosition({ quantity: 1.2 }); // 20% diff

    // With 25% tolerance → should pass
    const item = comparePositionPair(local, exchange, { ...defaultConfig, quantityTolerancePercent: 25 });
    expect(item.status).not.toBe("quantity_mismatch");
  });
});

// ─── Immutability ────────────────────────────────

describe("immutability", () => {
  it("does not mutate input arrays", () => {
    const local = makeLocalPosition();
    const exchange = makeExchangePosition();
    const localLen = [local].length;
    const exchangeLen = [exchange].length;

    reconcilePositions([local], [exchange]);

    expect([local].length).toBe(localLen);
    expect([exchange].length).toBe(exchangeLen);
  });
});
