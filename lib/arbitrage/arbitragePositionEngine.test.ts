/**
 * Arbitrage Position Engine Tests — Alpha Phase A3
 *
 * Acceptance criteria:
 *   Spot long: qty=1, entry=10000, mark=10100 → spotPnL = +100
 *   Perp short: qty=1, entry=10000, mark=10100 → perpPnL = -100
 *   fundingCollectedUsd = 50
 *   → totalPnlUsd = 50, deltaUsd = 0, deltaPercent = 0
 */

import { describe, expect, it } from "vitest";
import {
  calculatePositionDelta,
  calculatePositionPnl,
  closeArbitragePosition,
  createArbitragePosition,
  updateArbitragePosition,
} from "./arbitragePositionEngine";
import type { ArbitragePosition } from "./arbitragePositionTypes";

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
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
    fundingCollectedUsd: 50,
  });

  // Update mark prices to match acceptance criteria
  const updated = updateArbitragePosition(pos, { spotPrice: 10100, perpPrice: 10100 });

  it("spot PnL = +100 when price rises from 10000 to 10100", () => {
    expect(updated.spotLeg.unrealizedPnlUsd).toBe(100);
  });

  it("perp PnL = -100 when price rises from 10000 to 10100 (short)", () => {
    expect(updated.perpetualLeg.unrealizedPnlUsd).toBe(-100);
  });

  it("fundingCollectedUsd = 50", () => {
    expect(updated.fundingCollectedUsd).toBe(50);
  });

  it("totalPnlUsd = spotPnL + perpPnL + funding = 50", () => {
    expect(updated.totalPnlUsd).toBe(50);
  });

  it("deltaUsd = 0 (delta neutral)", () => {
    expect(updated.deltaUsd).toBe(0);
  });

  it("deltaPercent = 0", () => {
    expect(updated.deltaPercent).toBe(0);
  });
});

// ─── Create Position ─────────────────────────────────────

describe("createArbitragePosition", () => {
  it("creates a long spot + short perpetual position", () => {
    const pos = createArbitragePosition({
      symbol: "ETH/USDT",
      spotLeg: {
        exchange: "Binance",
        symbol: "ETH/USDT",
        marketType: "spot",
        side: "long",
        quantity: 10,
        entryPrice: 2000,
      },
      perpetualLeg: {
        exchange: "Binance",
        symbol: "ETH/USDT",
        marketType: "perpetual",
        side: "short",
        quantity: 10,
        entryPrice: 2000,
      },
    });

    expect(pos.symbol).toBe("ETH/USDT");
    expect(pos.status).toBe("open");
    expect(typeof pos.openedAt).toBe("number");
    expect(pos.spotLeg.side).toBe("long");
    expect(pos.spotLeg.marketType).toBe("spot");
    expect(pos.perpetualLeg.side).toBe("short");
    expect(pos.perpetualLeg.marketType).toBe("perpetual");
    expect(pos.spotLeg.quantity).toBe(10);
    expect(pos.spotLeg.entryPrice).toBe(2000);
  });

  it("assigns auto-generated id when not provided", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10000 },
    });
    expect(pos.id).toMatch(/^pos-\d{6}$/);
  });

  it("uses provided id", () => {
    const pos = createArbitragePosition({
      id: "my-custom-id",
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10000 },
    });
    expect(pos.id).toBe("my-custom-id");
  });

  it("defaults fundingCollectedUsd to 0", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10000 },
    });
    expect(pos.fundingCollectedUsd).toBe(0);
  });

  it("stores entryNetApy when provided", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10000 },
      entryNetApy: 29.5,
    });
    expect(pos.entryNetApy).toBe(29.5);
  });
});

// ─── Delta Calculations ──────────────────────────────────

describe("delta calculation", () => {
  it("delta neutral when notional values match on opposite sides", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10000 },
    });
    expect(pos.deltaUsd).toBe(0);
    expect(pos.deltaPercent).toBe(0);
  });

  it("positive delta when long notional > short notional", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1.02, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10000 },
    });
    // spotLong = 1.02 * 10000 = 10200, perpShort = 1 * 10000 = 10000
    // deltaUsd = 10200 - 10000 = 200
    // deltaPercent = 200 / 10200 * 100 ≈ 1.96%
    expect(pos.deltaUsd).toBe(200);
    expect(pos.deltaPercent).toBeCloseTo(1.96, 1);
  });

  it("negative delta when short notional > long notional", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1.05, entryPrice: 10000 },
    });
    // spotLong = 1 * 10000 = 10000, perpShort = 1.05 * 10000 = 10500
    // deltaUsd = 10000 - 10500 = -500
    // deltaPercent = -500 / 10500 * 100 ≈ -4.76%
    expect(pos.deltaUsd).toBe(-500);
    expect(pos.deltaPercent).toBeCloseTo(-4.76, 1);
  });

  it("calculatePositionDelta returns current delta", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1.02, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10000 },
    });
    const delta = calculatePositionDelta(pos);
    expect(delta.deltaUsd).toBe(200);
    expect(delta.deltaPercent).toBeCloseTo(1.96, 1);
  });
});

// ─── PnL Calculations ───────────────────────────────────

describe("PnL calculation", () => {
  it("price increase → spot long profits, perp short loses", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10000 },
    });
    const updated = updateArbitragePosition(pos, { spotPrice: 11000, perpPrice: 11000 });
    expect(updated.spotLeg.unrealizedPnlUsd).toBe(1000);
    expect(updated.perpetualLeg.unrealizedPnlUsd).toBe(-1000);
    expect(updated.totalPnlUsd).toBe(0); // funding not collected yet
  });

  it("price decrease → spot long loses, perp short profits", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10000 },
    });
    const updated = updateArbitragePosition(pos, { spotPrice: 9000, perpPrice: 9000 });
    expect(updated.spotLeg.unrealizedPnlUsd).toBe(-1000);
    expect(updated.perpetualLeg.unrealizedPnlUsd).toBe(1000);
    expect(updated.totalPnlUsd).toBe(0);
  });

  it("fundingCollectedUsd contributes to totalPnlUsd", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10000 },
      fundingCollectedUsd: 75,
    });
    expect(pos.totalPnlUsd).toBe(75);
  });

  it("calculatePositionPnl returns correct value", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10000 },
      fundingCollectedUsd: 30,
    });
    expect(calculatePositionPnl(pos)).toBe(30);
  });
});

// ─── Close Position ─────────────────────────────────────

describe("closeArbitragePosition", () => {
  it("sets status to closed", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10000 },
    });
    const closed = closeArbitragePosition(pos, { spotClosePrice: 10000, perpClosePrice: 10000 });
    expect(closed.status).toBe("closed");
  });

  it("closedAt is set to a timestamp", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10000 },
    });
    const closed = closeArbitragePosition(pos, { spotClosePrice: 10000, perpClosePrice: 10000 });
    expect(typeof closed.closedAt).toBe("number");
    expect(closed.closedAt).toBeGreaterThan(0);
  });

  it("final PnL is spot + perp + accumulated funding at close", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10000 },
      fundingCollectedUsd: 50,
    });
    // Close at a profit: spot at 10100, perp at 10000 (diverged)
    const closed = closeArbitragePosition(pos, { spotClosePrice: 10100, perpClosePrice: 10000, additionalFundingUsd: 10 });
    // spot: (10100 - 10000) * 1 = +100
    // perp: (10000 - 10000) * 1 = 0
    // funding: 50 + 10 = 60
    // total: 100 + 0 + 60 = 160
    expect(closed.totalPnlUsd).toBe(160);
    expect(closed.fundingCollectedUsd).toBe(60);
  });

  it("throws if position is already closed", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10000 },
    });
    const closed = closeArbitragePosition(pos, { spotClosePrice: 10000, perpClosePrice: 10000 });
    expect(() => closeArbitragePosition(closed, { spotClosePrice: 10000, perpClosePrice: 10000 })).toThrow("already closed");
  });
});

// ─── Update Position ────────────────────────────────────

describe("updateArbitragePosition", () => {
  it("updates mark prices and recalculates notional", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10000 },
    });
    const updated = updateArbitragePosition(pos, { spotPrice: 10500, perpPrice: 10500 });
    expect(updated.spotLeg.markPrice).toBe(10500);
    expect(updated.spotLeg.notionalUsd).toBe(10500);
    expect(updated.perpetualLeg.markPrice).toBe(10500);
    expect(updated.perpetualLeg.notionalUsd).toBe(10500);
  });

  it("preserves fundingCollectedUsd across updates", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10000 },
      fundingCollectedUsd: 100,
    });
    const updated = updateArbitragePosition(pos, { spotPrice: 11000, perpPrice: 11000 });
    expect(updated.fundingCollectedUsd).toBe(100);
  });
});

// ─── Edge Cases ──────────────────────────────────────────

describe("edge cases", () => {
  it("handles both legs long (non-arbitrage, still valid)", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Bybit", symbol: "BTC/USDT", marketType: "perpetual", side: "long", quantity: 2, entryPrice: 10000 },
    });
    // delta: spotLong(10000) + perpLong(20000) = +30000
    expect(pos.deltaUsd).toBe(30000);
    expect(pos.deltaPercent).toBe(150);
  });

  it("works with cross-exchange legs (Binance spot + Bybit perp)", () => {
    const pos = createArbitragePosition({
      symbol: "BTC/USDT",
      spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
      perpetualLeg: { exchange: "Bybit", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10100 },
    });
    expect(pos.spotLeg.exchange).toBe("Binance");
    expect(pos.perpetualLeg.exchange).toBe("Bybit");
  });
});
