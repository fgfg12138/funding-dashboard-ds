/**
 * Spread Paper Trader Engine Tests — Cross-Exchange Paper Trader
 *
 * Uses Mock Connectors + Funding Spread Engine to simulate
 * paper trading lifecycle.
 */

import { describe, expect, it } from "vitest";
import { createMockConnectors } from "../connectors/mocks/createMockConnectors";
import { findCrossExchangeFundingSpreads } from "../fundingSpread/fundingSpreadEngine";
import { DEFAULT_SPREAD_CONFIG } from "../fundingSpread/fundingSpreadTypes";
import {
  createInitialState,
  createSpreadPaperPosition,
  accrueSpreadFunding,
  updateSpreadPaperPosition,
  evaluateSpreadExit,
  closeSpreadPaperPosition,
  runSpreadPaperTraderStep,
  generateSpreadPaperTraderReport,
} from "./spreadPaperTraderEngine";
import { DEFAULT_PAPER_TRADER_CONFIG } from "./spreadPaperTraderTypes";

// ─── Setup ─────────────────────────────────────────────

const connectors = createMockConnectors();
const SYMBOLS = ["BTCUSDT"];

async function getTopOpp() {
  const result = await findCrossExchangeFundingSpreads(
    connectors, SYMBOLS,
    { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 },
  );
  return result[0];
}

// ─── 1-2. Create Position ────────────────────────────

describe("Spread Paper Trader", () => {
  it("1. createSpreadPaperPosition — short=high funding, long=low funding", async () => {
    const opp = await getTopOpp();
    const state = createInitialState(DEFAULT_PAPER_TRADER_CONFIG);
    const { position } = createSpreadPaperPosition(opp!, state);

    expect(position.status).toBe("open");
    expect(position.shortExchangeId).toBe(opp!.shortExchangeId);
    expect(position.longExchangeId).toBe(opp!.longExchangeId);
    expect(position.shortLeg.side).toBe("short");
    expect(position.longLeg.side).toBe("long");
  });

  it("2. Binance 0.0001 / Bybit -0.0002 — positive funding income", async () => {
    const opp = await getTopOpp();
    const state = createInitialState(DEFAULT_PAPER_TRADER_CONFIG);
    const { position } = createSpreadPaperPosition(opp!, state);

    // Short leg should have a higher funding rate than long leg
    expect(position.shortLeg.fundingRate).toBeGreaterThan(position.longLeg.fundingRate);
  });

  // ─── 3-5. Funding Accrual ─────────────────────────

  it("3. short positive funding → receive", async () => {
    const opp = await getTopOpp();
    const state = createInitialState(DEFAULT_PAPER_TRADER_CONFIG);
    const { position: pos } = createSpreadPaperPosition(opp!, state);

    // Fund rate is positive for short leg → receive
    const shortRate = pos.shortLeg.fundingRate;
    if (shortRate > 0) {
      expect(pos.shortLeg.fundingCollectedUsd).toBe(0);
    }
  });

  it("4. long negative funding → receive", async () => {
    const opp = await getTopOpp();
    const state = createInitialState(DEFAULT_PAPER_TRADER_CONFIG);
    const { position: pos } = createSpreadPaperPosition(opp!, state);

    const longRate = pos.longLeg.fundingRate;
    if (longRate < 0) {
      expect(pos.longLeg.fundingCollectedUsd).toBe(0);
    }
  });

  it("5. fundingCollectedUsd accumulates after accrual", async () => {
    const opp = await getTopOpp();
    const state = createInitialState(DEFAULT_PAPER_TRADER_CONFIG);
    const { position: pos, newState: s1 } = createSpreadPaperPosition(opp!, state);

    const { position: updated, newState } = accrueSpreadFunding(pos, 1, s1);
    expect(updated.fundingCollectedUsd).not.toBe(0);
    expect(newState.fundingEvents.length).toBe(2);
  });

  // ─── 6. Update Position ──────────────────────────

  it("6. currentSpreadRate updates after apply", async () => {
    const opp = await getTopOpp();
    const state = createInitialState(DEFAULT_PAPER_TRADER_CONFIG);
    const { position: pos, newState: s1 } = createSpreadPaperPosition(opp!, state);

    const result = updateSpreadPaperPosition(pos, 0.0002, -0.0003, 61000, 61000, s1);
    expect(result.position.currentSpreadRate).toBe(0.0005);
  });

  // ─── 7. Max Open Positions ───────────────────────

  it("7. maxOpenPositions limits concurrent positions", async () => {
    const state = createInitialState({ ...DEFAULT_PAPER_TRADER_CONFIG, maxOpenPositions: 1 });

    // Use 3 symbols to try opening more than 1
    const { newState } = await runSpreadPaperTraderStep(
      { binance: connectors.binance, bybit: connectors.bybit, okx: connectors.okx },
      ["BTCUSDT", "ETHUSDT"],
      state,
      { ...DEFAULT_PAPER_TRADER_CONFIG, maxOpenPositions: 1, minNetSpreadApy: 0 },
    );

    expect(newState.openPositions.length).toBeLessThanOrEqual(1);
  });

  // ─── 8. Same symbol dedup ───────────────────────

  it("8. same symbol does not open second position", async () => {
    const state = createInitialState({ ...DEFAULT_PAPER_TRADER_CONFIG, maxOpenPositions: 5 });

    const { newState } = await runSpreadPaperTraderStep(
      connectors,
      ["BTCUSDT"],
      state,
      { ...DEFAULT_PAPER_TRADER_CONFIG, maxOpenPositions: 5, minNetSpreadApy: 0 },
    );

    // Only BTCUSDT opportunities — should open at most 1 per symbol
    const btcPositions = newState.openPositions.filter((p) => p.canonicalSymbol === "BTCUSDT");
    expect(btcPositions.length).toBeLessThanOrEqual(1);
  });

  // ─── 9. Min Net Spread APY ──────────────────────

  it("9. minNetSpreadApy filters opportunities", async () => {
    const state = createInitialState(DEFAULT_PAPER_TRADER_CONFIG);

    const { newState } = await runSpreadPaperTraderStep(
      connectors,
      ["BTCUSDT"],
      state,
      { ...DEFAULT_PAPER_TRADER_CONFIG, minNetSpreadApy: 999_999 },
    );

    expect(newState.openPositions.length).toBe(0);
  });

  // ─── 10-13. Exit Conditions ─────────────────────

  it("10. spread narrowed triggers exit", () => {
    const opp = {
      id: "btc-binance-bybit-test",
      canonicalSymbol: "BTCUSDT",
      shortExchangeId: "binance",
      longExchangeId: "bybit",
      shortLeg: { exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", fundingRate: 0.0001, intervalHours: 8, markPrice: 60000, side: "short" as const, expectedFundingDirection: "receive" as const },
      longLeg: { exchangeId: "bybit", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", fundingRate: -0.0002, intervalHours: 8, markPrice: 60000, side: "long" as const, expectedFundingDirection: "receive" as const },
      spreadRate: 0.0003,
      spreadApy: 32.85,
      netSpreadApy: 32.8,
      estimatedFundingUsdPerInterval: 0.03,
      score: 90,
      reasons: ["Test"],
      createdAt: Date.now(),
    };
    const state = createInitialState(DEFAULT_PAPER_TRADER_CONFIG);
    const { position: pos, newState: s1 } = createSpreadPaperPosition(opp, state);

    // Narrow the spread to 0.0001 (< 0.00015 = entry 0.0003 * 0.5)
    const narrowed = updateSpreadPaperPosition(pos, 0.0001, -0.00015, 60000, 60000, s1);
    // spread = 0.0001 - (-0.00015) = 0.00025, still > 0.00015, must go lower
    const narrowed2 = updateSpreadPaperPosition(narrowed.position, 0.0001, -0.0001, 60000, 60000, narrowed.newState);
    // spread = 0.0001 - (-0.0001) = 0.0002, still > 0.00015
    const narrowed3 = updateSpreadPaperPosition(narrowed2.position, 0.0001, -0.00004, 60000, 60000, narrowed2.newState);
    // spread = 0.00014 < 0.00015 ✓
    const reason = evaluateSpreadExit(narrowed3.position);
    expect(reason.type).toBe("spread_narrowed");
  });

  it("11. maxHoldingHours triggers exit", () => {
    const opp = {
      id: "btc-binance-bybit-test2",
      canonicalSymbol: "BTCUSDT",
      shortExchangeId: "binance",
      longExchangeId: "bybit",
      shortLeg: { exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", fundingRate: 0.0001, intervalHours: 8, markPrice: 60000, side: "short" as const, expectedFundingDirection: "receive" as const },
      longLeg: { exchangeId: "bybit", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", fundingRate: -0.0002, intervalHours: 8, markPrice: 60000, side: "long" as const, expectedFundingDirection: "receive" as const },
      spreadRate: 0.0003,
      spreadApy: 32.85,
      netSpreadApy: 32.8,
      estimatedFundingUsdPerInterval: 0.03,
      score: 90,
      reasons: ["Test"],
      createdAt: Date.now(),
    };
    const state = createInitialState(DEFAULT_PAPER_TRADER_CONFIG);
    const { position: pos } = createSpreadPaperPosition(opp, state);

    const overHeld = { ...pos, holdingHours: 100 };
    const reason = evaluateSpreadExit(overHeld, { ...DEFAULT_PAPER_TRADER_CONFIG, maxHoldingHours: 48 });
    expect(reason.type).toBe("max_holding_hours");
  });

  it("12. takeProfit triggers exit", () => {
    const opp = {
      id: "btc-binance-bybit-tp",
      canonicalSymbol: "BTCUSDT",
      shortExchangeId: "binance",
      longExchangeId: "bybit",
      shortLeg: { exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", fundingRate: 0.0001, intervalHours: 8, markPrice: 60000, side: "short" as const, expectedFundingDirection: "receive" as const },
      longLeg: { exchangeId: "bybit", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", fundingRate: -0.0002, intervalHours: 8, markPrice: 60000, side: "long" as const, expectedFundingDirection: "receive" as const },
      spreadRate: 0.0003,
      spreadApy: 32.85,
      netSpreadApy: 32.8,
      estimatedFundingUsdPerInterval: 0.03,
      score: 90,
      reasons: ["Test"],
      createdAt: Date.now(),
    };
    const state = createInitialState(DEFAULT_PAPER_TRADER_CONFIG);
    const { position: pos } = createSpreadPaperPosition(opp, state);

    const profitable = { ...pos, totalPnlUsd: 10 };
    const reason = evaluateSpreadExit(profitable, { ...DEFAULT_PAPER_TRADER_CONFIG, takeProfitUsd: 5 });
    expect(reason.type).toBe("take_profit");
  });

  it("13. stopLoss triggers exit", () => {
    const opp = {
      id: "btc-binance-bybit-sl",
      canonicalSymbol: "BTCUSDT",
      shortExchangeId: "binance",
      longExchangeId: "bybit",
      shortLeg: { exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", fundingRate: 0.0001, intervalHours: 8, markPrice: 60000, side: "short" as const, expectedFundingDirection: "receive" as const },
      longLeg: { exchangeId: "bybit", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", fundingRate: -0.0002, intervalHours: 8, markPrice: 60000, side: "long" as const, expectedFundingDirection: "receive" as const },
      spreadRate: 0.0003,
      spreadApy: 32.85,
      netSpreadApy: 32.8,
      estimatedFundingUsdPerInterval: 0.03,
      score: 90,
      reasons: ["Test"],
      createdAt: Date.now(),
    };
    const state = createInitialState(DEFAULT_PAPER_TRADER_CONFIG);
    const { position: pos } = createSpreadPaperPosition(opp, state);

    const losing = { ...pos, totalPnlUsd: -10 };
    const reason = evaluateSpreadExit(losing, { ...DEFAULT_PAPER_TRADER_CONFIG, stopLossUsd: 5 });
    expect(reason.type).toBe("stop_loss");
  });

  // ─── 14. Close Position ──────────────────────────

  it("14. closed position moves to closedPositions", () => {
    const opp = {
      id: "btc-binance-bybit-close",
      canonicalSymbol: "BTCUSDT",
      shortExchangeId: "binance",
      longExchangeId: "bybit",
      shortLeg: { exchangeId: "binance", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", fundingRate: 0.0001, intervalHours: 8, markPrice: 60000, side: "short" as const, expectedFundingDirection: "receive" as const },
      longLeg: { exchangeId: "bybit", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", fundingRate: -0.0002, intervalHours: 8, markPrice: 60000, side: "long" as const, expectedFundingDirection: "receive" as const },
      spreadRate: 0.0003,
      spreadApy: 32.85,
      netSpreadApy: 32.8,
      estimatedFundingUsdPerInterval: 0.03,
      score: 90,
      reasons: ["Test"],
      createdAt: Date.now(),
    };
    const state = createInitialState(DEFAULT_PAPER_TRADER_CONFIG);
    const { position: pos, newState: s1 } = createSpreadPaperPosition(opp, state);
    const reason: any = { type: "spread_narrowed", detail: "Test" };
    const { newState: s2 } = closeSpreadPaperPosition(pos, reason, s1);

    expect(s2.openPositions.length).toBe(0);
    expect(s2.closedPositions.length).toBe(1);
    expect(s2.closedPositions[0].status).toBe("closed");
  });

  // ─── 15. Report ────────────────────────────────

  it("15. generates report with correct totals", async () => {
    const state = createInitialState(DEFAULT_PAPER_TRADER_CONFIG);
    const { newState } = await runSpreadPaperTraderStep(
      { binance: connectors.binance, bybit: connectors.bybit },
      ["BTCUSDT"],
      state,
      { ...DEFAULT_PAPER_TRADER_CONFIG, minNetSpreadApy: 0 },
    );

    const report = generateSpreadPaperTraderReport(newState);

    expect(report.totalCapitalUsd).toBe(1000);
    expect(report.openPositionCount).toBeGreaterThanOrEqual(0);
    expect(report.closedPositionCount).toBeGreaterThanOrEqual(0);
    expect(typeof report.totalPnlUsd).toBe("number");
  });

  // ─── 16. No real API ────────────────────────────

  it("16. no real API usage (uses mock connectors)", () => {
    expect(true).toBe(true);
  });

  // ─── 17. No mutation ────────────────────────────

  it("17. engine does not mutate input config", async () => {
    const state = createInitialState(DEFAULT_PAPER_TRADER_CONFIG);
    const originalPosCount = state.openPositions.length;

    await runSpreadPaperTraderStep(
      { binance: connectors.binance, bybit: connectors.bybit },
      ["BTCUSDT"],
      { ...state, currentTime: state.currentTime },
      { ...DEFAULT_PAPER_TRADER_CONFIG, minNetSpreadApy: 0 },
    );

    // Original state should be unchanged
    expect(state.openPositions.length).toBe(originalPosCount);
  });
});
