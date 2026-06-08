/**
 * Exit Engine Tests — Alpha Phase A5
 *
 * Acceptance criteria:
 *   position: totalPnlUsd=50, fundingCollectedUsd=51, deltaPercent=0,
 *             openedAt=2026-01-01 00:00 UTC
 *   context: currentTime=2026-01-02 00:00 UTC, currentNetApy=8,
 *            entryFundingRate=0.0003, currentFundingRate=0.0001
 *   config: minNetApyPercent=10, maxDeltaPercent=3, maxHoldingHours=48,
 *           fundingDeclineThresholdPercent=50
 *   → shouldExit=true, reasons=[funding_declined, net_apy_too_low], severity=medium
 */

import { describe, expect, it } from "vitest";
import {
  evaluateDeltaExit,
  evaluateExit,
  evaluateFundingDecline,
  evaluateHoldingTimeExit,
  evaluateNetApyExit,
  evaluateStopLoss,
  evaluateTakeProfit,
} from "./exitEngine";
import { createArbitragePosition } from "./arbitragePositionEngine";

// ─── Helpers ─────────────────────────────────────────────

const UTC = (y: number, m: number, d: number, h: number) =>
  Date.UTC(y, m - 1, d, h, 0, 0, 0);

function makePos(overrides?: Partial<ReturnType<typeof createArbitragePosition>>) {
  const base = createArbitragePosition({
    symbol: "BTC/USDT",
    spotLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "spot", side: "long", quantity: 1, entryPrice: 10000 },
    perpetualLeg: { exchange: "Binance", symbol: "BTC/USDT", marketType: "perpetual", side: "short", quantity: 1, entryPrice: 10000 },
    fundingCollectedUsd: 51,
    entryNetApy: 29,
  });
  return {
    ...base,
    openedAt: UTC(2026, 1, 1, 0), // 2026-01-01 00:00 UTC
    ...overrides,
  };
}

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  const pos = makePos({ totalPnlUsd: 50, deltaPercent: 0 });
  const decision = evaluateExit(
    pos,
    {
      minNetApyPercent: 10,
      maxDeltaPercent: 3,
      maxHoldingHours: 48,
      fundingDeclineThresholdPercent: 50,
    },
    {
      currentTime: UTC(2026, 1, 2, 0), // 2026-01-02 00:00 UTC (24h later)
      currentNetApy: 8,
      entryFundingRate: 0.0003,
      currentFundingRate: 0.0001,
    },
  );

  it("shouldExit is true", () => {
    expect(decision.shouldExit).toBe(true);
  });

  it("reasons contains funding_declined and net_apy_too_low", () => {
    expect(decision.reasons).toContain("funding_declined");
    expect(decision.reasons).toContain("net_apy_too_low");
    expect(decision.reasons).not.toContain("max_holding_time_exceeded");
  });

  it("severity is medium (no high-severity reasons)", () => {
    expect(decision.severity).toBe("medium");
  });

  it("message is non-empty", () => {
    expect(decision.message.length).toBeGreaterThan(0);
  });

  it("checkedAt matches context currentTime", () => {
    expect(decision.checkedAt).toBe(UTC(2026, 1, 2, 0));
  });

  it("metrics include all required fields", () => {
    expect(decision.metrics.totalPnlUsd).toBe(50);
    expect(decision.metrics.fundingCollectedUsd).toBe(51);
    expect(decision.metrics.deltaPercent).toBe(0);
    expect(decision.metrics.currentNetApy).toBe(8);
    expect(decision.metrics.currentFundingRate).toBe(0.0001);
    expect(decision.metrics.holdingHours).toBeCloseTo(24, 0);
  });
});

// ─── No Exit ─────────────────────────────────────────────

describe("no exit signals", () => {
  it("shouldExit is false when no reasons trigger", () => {
    const pos = makePos({ totalPnlUsd: 50, deltaPercent: 0 });
    const decision = evaluateExit(
      pos,
      { minNetApyPercent: 5, maxDeltaPercent: 5, maxHoldingHours: 48 },
      { currentTime: UTC(2026, 1, 1, 6), currentNetApy: 20 },
    );
    expect(decision.shouldExit).toBe(false);
    expect(decision.reasons).toEqual([]);
    expect(decision.severity).toBe("low");
  });
});

// ─── evaluateFundingDecline ──────────────────────────────

describe("evaluateFundingDecline", () => {
  it("returns true when decline >= threshold", () => {
    // entry=0.0003, current=0.0001, decline=(0.0003-0.0001)/0.0003*100=66.67%
    expect(evaluateFundingDecline(0.0001, 0.0003, 50)).toBe(true);
  });

  it("returns false when decline < threshold", () => {
    // entry=0.0003, current=0.00025, decline=(0.0003-0.00025)/0.0003*100=16.67%
    expect(evaluateFundingDecline(0.00025, 0.0003, 50)).toBe(false);
  });

  it("returns false when entry rate is 0", () => {
    expect(evaluateFundingDecline(0.0001, 0, 50)).toBe(false);
  });
});

// ─── evaluateNetApyExit ─────────────────────────────────

describe("evaluateNetApyExit", () => {
  it("returns true when netApy < min", () => {
    expect(evaluateNetApyExit(8, 10)).toBe(true);
  });

  it("returns false when netApy >= min", () => {
    expect(evaluateNetApyExit(12, 10)).toBe(false);
    expect(evaluateNetApyExit(10, 10)).toBe(false);
  });
});

// ─── evaluateDeltaExit ──────────────────────────────────

describe("evaluateDeltaExit", () => {
  it("returns true when |delta| > max", () => {
    expect(evaluateDeltaExit(5, 3)).toBe(true);
    expect(evaluateDeltaExit(-5, 3)).toBe(true);
  });

  it("returns false when |delta| <= max", () => {
    expect(evaluateDeltaExit(3, 3)).toBe(false);
    expect(evaluateDeltaExit(0, 3)).toBe(false);
  });
});

// ─── evaluateHoldingTimeExit ────────────────────────────

describe("evaluateHoldingTimeExit", () => {
  it("returns true when holding hours >= max", () => {
    // opened at 0, current at 48h+1ms → true
    const opened = UTC(2026, 1, 1, 0);
    const current = UTC(2026, 1, 3, 0); // 48h later exactly
    expect(evaluateHoldingTimeExit(opened, current, 48)).toBe(true);
  });

  it("returns false when holding hours < max", () => {
    const opened = UTC(2026, 1, 1, 0);
    const current = UTC(2026, 1, 1, 23); // 23h
    expect(evaluateHoldingTimeExit(opened, current, 48)).toBe(false);
  });
});

// ─── evaluateTakeProfit ─────────────────────────────────

describe("evaluateTakeProfit", () => {
  it("returns true when PnL >= threshold", () => {
    expect(evaluateTakeProfit(100, 100)).toBe(true);
    expect(evaluateTakeProfit(150, 100)).toBe(true);
  });

  it("returns false when PnL < threshold", () => {
    expect(evaluateTakeProfit(50, 100)).toBe(false);
  });
});

// ─── evaluateStopLoss ───────────────────────────────────

describe("evaluateStopLoss", () => {
  it("returns true when PnL <= -stopLoss", () => {
    expect(evaluateStopLoss(-100, 100)).toBe(true);
    expect(evaluateStopLoss(-200, 100)).toBe(true);
  });

  it("returns false when PnL > -stopLoss", () => {
    expect(evaluateStopLoss(-50, 100)).toBe(false);
    expect(evaluateStopLoss(50, 100)).toBe(false);
  });
});

// ─── Full Integration: Take Profit ──────────────────────

describe("exit — take profit", () => {
  it("triggers take_profit_reached when PnL >= takeProfitUsd", () => {
    const pos = makePos({ totalPnlUsd: 200, deltaPercent: 0 });
    const decision = evaluateExit(
      pos,
      { takeProfitUsd: 150 },
      { currentTime: UTC(2026, 1, 1, 6) },
    );
    expect(decision.reasons).toContain("take_profit_reached");
    expect(decision.shouldExit).toBe(true);
  });
});

// ─── Full Integration: Stop Loss ────────────────────────

describe("exit — stop loss", () => {
  it("triggers stop_loss_reached when PnL <= -stopLossUsd", () => {
    const pos = makePos({ totalPnlUsd: -300, deltaPercent: 0 });
    const decision = evaluateExit(
      pos,
      { stopLossUsd: 200 },
      { currentTime: UTC(2026, 1, 1, 6) },
    );
    expect(decision.reasons).toContain("stop_loss_reached");
    expect(decision.shouldExit).toBe(true);
  });
});

// ─── Severity: High ─────────────────────────────────────

describe("severity — high", () => {
  it("stop_loss_reached triggers high severity", () => {
    const pos = makePos({ totalPnlUsd: -500, deltaPercent: 0 });
    const decision = evaluateExit(
      pos,
      { stopLossUsd: 200 },
      { currentTime: UTC(2026, 1, 1, 6) },
    );
    expect(decision.severity).toBe("high");
  });

  it("delta_too_high triggers high severity", () => {
    const pos = makePos({ totalPnlUsd: 50, deltaPercent: 10 });
    const decision = evaluateExit(
      pos,
      { maxDeltaPercent: 3 },
      { currentTime: UTC(2026, 1, 1, 6) },
    );
    expect(decision.severity).toBe("high");
  });
});

// ─── Holding Time Integration ───────────────────────────

describe("exit — holding time", () => {
  it("triggers max_holding_time_exceeded", () => {
    const pos = makePos({ totalPnlUsd: 50, deltaPercent: 0 });
    const decision = evaluateExit(
      pos,
      { maxHoldingHours: 12 },
      { currentTime: UTC(2026, 1, 2, 0) }, // 24h > 12h
    );
    expect(decision.reasons).toContain("max_holding_time_exceeded");
    expect(decision.shouldExit).toBe(true);
  });
});

// ─── Immutability ───────────────────────────────────────

describe("immutability", () => {
  it("evaluateExit does not mutate position", () => {
    const pos = makePos({ totalPnlUsd: 50 });
    const originalFunding = pos.fundingCollectedUsd;
    evaluateExit(pos, {}, { currentTime: UTC(2026, 1, 1, 6) });
    expect(pos.fundingCollectedUsd).toBe(originalFunding);
  });
});
