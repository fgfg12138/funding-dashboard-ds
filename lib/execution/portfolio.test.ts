import { describe, expect, it } from "vitest";
import type { PaperExecution } from "./types";
import {
  calculateAverageNetAnnualizedRate,
  calculateClosedPnL,
  calculateOpenNotional,
  groupExecutionsByExchange,
  groupExecutionsByType,
  summarizePaperPortfolio,
} from "./portfolio";

const baseExec: PaperExecution = {
  id: "paper-1",
  opportunityId: "opp-1",
  opportunityType: "cross-exchange",
  symbol: "BTC/USDT",
  base: "BTC",
  quote: "USDT",
  mode: "paper",
  status: "opened",
  legs: [
    { id: "leg-1", venue: "Binance", marketType: "perp", side: "short", symbol: "BTC/USDT", notionalUsd: 500, estimatedEntryPrice: 0, estimatedFee: 0.5, estimatedSlippage: 0.25 },
    { id: "leg-2", venue: "OKX", marketType: "perp", side: "long", symbol: "BTC/USDT", notionalUsd: 500, estimatedEntryPrice: 0, estimatedFee: 0.5, estimatedSlippage: 0.25 },
  ],
  sideDescription: "Short Binance / Long OKX",
  exchanges: ["Binance", "OKX"],
  estimatedAnnualizedRate: 21.5,
  estimatedFundingRate: 0.001,
  estimatedFees: 1.0,
  estimatedSlippage: 0.5,
  estimatedNetRate: 18.0,
  riskTags: [],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  openedAt: 1_700_000_000_000,
  closedAt: null,
  closeReason: null,
};

const TEN_HOURS_MS = 36_000_000;

const closedExec: PaperExecution = {
  ...baseExec,
  id: "paper-2",
  status: "closed",
  closedAt: 1_700_000_000_000 + TEN_HOURS_MS, // 10 hours later
  closeReason: "手动平仓",
};

const spotPerpExec: PaperExecution = {
  ...baseExec,
  id: "paper-3",
  opportunityType: "spot-perp",
  symbol: "ETH/USDT",
  exchanges: ["Bybit"],
  legs: [
    { id: "leg-3", venue: "Bybit", marketType: "spot", side: "buy", symbol: "ETH/USDT", notionalUsd: 1000, estimatedEntryPrice: 0, estimatedFee: 1, estimatedSlippage: 0.5 },
    { id: "leg-4", venue: "Bybit", marketType: "perp", side: "short", symbol: "ETH/USDT", notionalUsd: 1000, estimatedEntryPrice: 0, estimatedFee: 1, estimatedSlippage: 0.5 },
  ],
  estimatedFees: 2.0,
  estimatedSlippage: 1.0,
  estimatedNetRate: 12.0,
  openedAt: 1_700_000_000_000,
  closedAt: null,
  status: "opened",
};

const allExecs = [baseExec, closedExec, spotPerpExec];
const HOURS_PER_YEAR = 8760;

describe("portfolio", () => {
  describe("summarizePaperPortfolio", () => {
    it("returns zeros for empty input", () => {
      const result = summarizePaperPortfolio([]);
      expect(result.totalExecutions).toBe(0);
      expect(result.openExecutions).toBe(0);
      expect(result.closedExecutions).toBe(0);
      expect(result.openNotionalUsd).toBe(0);
      expect(result.estimatedClosedPnL).toBe(0);
    });

    it("counts open and closed correctly", () => {
      const result = summarizePaperPortfolio(allExecs);
      expect(result.totalExecutions).toBe(3);
      expect(result.openExecutions).toBe(2);
      expect(result.closedExecutions).toBe(1);
    });

    it("computes open notional USD as sum of leg notionals", () => {
      const result = summarizePaperPortfolio(allExecs);
      // baseExec: 500 + 500 = 1000, spotPerpExec: 1000 + 1000 = 2000 → total 3000
      expect(result.openNotionalUsd).toBe(3000);
    });

    it("estimates closed PnL using duration and net rate", () => {
      const result = summarizePaperPortfolio(allExecs);
      // closedExec:  held 10h = 36000s = 10h
      // notional = 500 + 500 = 1000
      // PnL = (18/100) * (10/8760) * 1000 ≈ 0.2055
      const expectedPnL = (18 / 100) * (10 / HOURS_PER_YEAR) * 1000;
      expect(result.estimatedClosedPnL).toBeCloseTo(expectedPnL, 4);
    });
  });

  describe("calculateOpenNotional", () => {
    it("sums notional for open executions only", () => {
      expect(calculateOpenNotional(allExecs)).toBe(3000);
      expect(calculateOpenNotional([])).toBe(0);
    });
  });

  describe("calculateClosedPnL", () => {
    it("sums estimated PnL for closed executions", () => {
      const pnl = calculateClosedPnL(allExecs);
      const expected = (18 / 100) * (10 / HOURS_PER_YEAR) * 1000;
      expect(pnl).toBeCloseTo(expected, 4);
    });

    it("returns 0 when no closed executions", () => {
      expect(calculateClosedPnL([baseExec, spotPerpExec])).toBe(0);
    });
  });

  describe("calculateAverageNetAnnualizedRate", () => {
    it("returns weighted average by notional", () => {
      const result = calculateAverageNetAnnualizedRate(allExecs);
      // baseExec: 18% × 1000 notional, closedExec: 18% × 1000, spotPerp: 12% × 2000
      // weighted = (18*1000 + 18*1000 + 12*2000) / (1000 + 1000 + 2000)
      // = (18000 + 18000 + 24000) / 4000 = 60000/4000 = 15
      expect(result).toBe(15);
    });

    it("returns 0 for empty input", () => {
      expect(calculateAverageNetAnnualizedRate([])).toBe(0);
    });
  });

  describe("groupExecutionsByType", () => {
    it("groups counts by opportunity type", () => {
      const result = groupExecutionsByType(allExecs);
      expect(result["cross-exchange"]).toBe(2);
      expect(result["spot-perp"]).toBe(1);
      expect(result["basis"]).toBe(0);
    });
  });

  describe("groupExecutionsByExchange", () => {
    it("counts how many executions reference each exchange", () => {
      const result = groupExecutionsByExchange(allExecs);
      // baseExec: Binance+OKX, closedExec: Binance+OKX, spotPerpExec: Bybit
      expect(result["Binance"]).toBe(2);
      expect(result["OKX"]).toBe(2);
      expect(result["Bybit"]).toBe(1);
    });
  });
});
