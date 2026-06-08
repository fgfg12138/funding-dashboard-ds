import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedOpportunity } from "../opportunities/types";
import type { ExecutionEstimateInput } from "./types";
import {
  annualizeReturn,
  buildExecutionLegs,
  createPaperExecutionFromOpportunity,
  estimateBasisReturns,
  estimateCrossExchangeReturns,
  estimateExecutionReturns,
  estimateSpotPerpReturns,
  normalizeOpportunityToExecutionInput,
  resetEngineIdCounter,
  toExecutionOpportunityType,
} from "./executionEngine";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
  resetEngineIdCounter();
});

afterEach(() => {
  vi.useRealTimers();
});

const crossOpp: UnifiedOpportunity = {
  id: "cross-1",
  opportunityType: "CrossExchange",
  symbol: "BTC/USDT",
  base: "BTC",
  quote: "USDT",
  primaryExchange: "Binance",
  secondaryExchange: "OKX",
  direction: "Short Binance / Long OKX",
  fundingRate: 0.001,
  annualizedRate: 21.5,
  volume24h: 5_000_000_000,
  openInterestUsd: 12_000_000_000,
  nextFundingTime: 1_700_000_100_000,
  score: 82,
  riskTags: [],
  opportunityReason: "Binance high funding, OKX moderate",
};

const spotPerpOpp: UnifiedOpportunity = {
  id: "sp-1",
  opportunityType: "SpotPerp",
  symbol: "ETH/USDT",
  base: "ETH",
  quote: "USDT",
  primaryExchange: "Bybit",
  direction: "Buy Spot / Short Perp on Bybit",
  fundingRate: 0.0005,
  annualizedRate: 15.2,
  volume24h: 2_000_000_000,
  score: 71,
  riskTags: ["中等流动性"],
  opportunityReason: "Positive funding on Bybit perp",
};

const basisOpp: UnifiedOpportunity = {
  id: "basis-1",
  opportunityType: "Basis",
  symbol: "SOL/USDT",
  base: "SOL",
  quote: "USDT",
  primaryExchange: "Binance",
  direction: "Buy Spot / Short Perp for basis",
  fundingRate: 0.0002,
  annualizedRate: 8.5,
  score: 55,
  riskTags: ["低流动性", "基础差"],
  opportunityReason: "Positive basis on Binance",
};

describe("executionEngine", () => {
  describe("toExecutionOpportunityType", () => {
    it("maps CrossExchange", () => {
      expect(toExecutionOpportunityType("CrossExchange")).toBe("cross-exchange");
    });
    it("maps SpotPerp", () => {
      expect(toExecutionOpportunityType("SpotPerp")).toBe("spot-perp");
    });
    it("maps Basis", () => {
      expect(toExecutionOpportunityType("Basis")).toBe("basis");
    });
    it("falls back to unknown", () => {
      expect(toExecutionOpportunityType("something" as never)).toBe("unknown");
    });
  });

  describe("normalizeOpportunityToExecutionInput", () => {
    it("produces correct input for a cross-exchange opportunity", () => {
      const input = normalizeOpportunityToExecutionInput(crossOpp);
      expect(input.opportunityId).toBe("cross-1");
      expect(input.opportunityType).toBe("cross-exchange");
      expect(input.symbol).toBe("BTC/USDT");
      expect(input.sideDescription).toBe("Short Binance / Long OKX");
      expect(input.exchanges).toEqual(["Binance", "OKX"]);
      expect(input.estimatedAnnualizedRate).toBe(21.5);
      expect(input.estimatedFundingRate).toBe(0.001);
      expect(input.estimatedNetRate).toBeGreaterThan(0);
      expect(input.legs).toHaveLength(2);
      expect(input.legs[0].side).toBe("short");
      expect(input.legs[1].side).toBe("long");
    });

    it("produces correct input for a spot-perp opportunity", () => {
      const input = normalizeOpportunityToExecutionInput(spotPerpOpp);
      expect(input.opportunityType).toBe("spot-perp");
      expect(input.exchanges).toEqual(["Bybit"]);
      expect(input.legs).toHaveLength(2);
      expect(input.legs[0].marketType).toBe("spot");
      expect(input.legs[0].side).toBe("buy");
      expect(input.legs[1].marketType).toBe("perp");
      expect(input.legs[1].side).toBe("short");
    });

    it("produces correct input for a basis opportunity", () => {
      const input = normalizeOpportunityToExecutionInput(basisOpp);
      expect(input.opportunityType).toBe("basis");
      expect(input.riskTags).toContain("低流动性");
      expect(input.legs).toHaveLength(2);
    });
  });

  describe("buildExecutionLegs", () => {
    it("builds 2 legs for cross-exchange", () => {
      const legs = buildExecutionLegs(crossOpp);
      expect(legs).toHaveLength(2);
      expect(legs[0].venue).toBe("Binance");
      expect(legs[0].side).toBe("short");
      expect(legs[1].venue).toBe("OKX");
      expect(legs[1].side).toBe("long");
    });

    it("builds 2 legs for spot-perp", () => {
      const legs = buildExecutionLegs(spotPerpOpp);
      expect(legs).toHaveLength(2);
      expect(legs[0].marketType).toBe("spot");
      expect(legs[1].marketType).toBe("perp");
    });

    it("each leg has reasonable estimated fees", () => {
      const legs = buildExecutionLegs(crossOpp);
      for (const leg of legs) {
        expect(leg.estimatedFee).toBeGreaterThan(0);
        expect(leg.estimatedSlippage).toBeGreaterThan(0);
      }
    });
  });

  describe("createPaperExecutionFromOpportunity", () => {
    it("returns a PaperExecution with correct defaults", () => {
      const exec = createPaperExecutionFromOpportunity(crossOpp);
      expect(exec.id).toMatch(/^paper-/);
      expect(exec.mode).toBe("paper");
      expect(exec.status).toBe("opened");
      expect(exec.symbol).toBe("BTC/USDT");
      expect(exec.legs).toHaveLength(2);
      expect(exec.createdAt).toBe(1_700_000_000_000);
      expect(exec.openedAt).toBe(1_700_000_000_000);
      expect(exec.closedAt).toBeNull();
      expect(exec.closeReason).toBeNull();
      expect(exec.estimatedAnnualizedRate).toBe(21.5);
    });

    it("sets closedAt and closeReason to null defaults", () => {
      const exec = createPaperExecutionFromOpportunity(spotPerpOpp);
      expect(exec.closedAt).toBeNull();
      expect(exec.closeReason).toBeNull();
    });
  });
});

// ─── Estimate helpers ───────────────────────────────────

const HOURS_PER_YEAR = 8760;

/** Build an ExecutionEstimateInput from raw params. */
function estimateInput(overrides: Partial<ExecutionEstimateInput> & { opportunityType: ExecutionEstimateInput["opportunityType"] }): ExecutionEstimateInput {
  return {
    annualizedRate: 20,
    fundingRate: 0.001,
    notionalUsd: 1000,
    fees: 0.5,
    slippage: 0.25,
    ...overrides,
  };
}

describe("annualizeReturn", () => {
  it("annualizes a positive return correctly", () => {
    // $2 net return on $1000 notional over 8 hours
    const result = annualizeReturn(2, 1000, 8);
    // netRate = 2/1000 = 0.002, annualized = 0.002 * (8760/8) * 100 = 219%
    expect(result).toBeCloseTo(219, 1);
  });

  it("annualizes a negative return", () => {
    const result = annualizeReturn(-1, 1000, 8);
    expect(result).toBeCloseTo(-109.5, 1);
  });

  it("returns 0 when notional is zero", () => {
    expect(annualizeReturn(10, 0, 8)).toBe(0);
  });

  it("returns 0 when holding hours is zero", () => {
    expect(annualizeReturn(10, 1000, 0)).toBe(0);
  });
});

describe("estimateSpotPerpReturns", () => {
  const base: ExecutionEstimateInput = estimateInput({
    opportunityType: "spot-perp",
    fundingRate: 0.001,    // 0.1 % per settlement
    notionalUsd: 1000,
    fees: 0.5,
    slippage: 0.25,
    holding: { holdingHours: 8, fundingIntervalHours: 8 },
  });

  it("computes positive returns when funding covers costs", () => {
    // gross = 0.001 * 1000 * (8/8) = $1
    // net = 1 - 0.5 - 0.25 = $0.25
    const result = estimateSpotPerpReturns(base);
    expect(result.grossReturn).toBeCloseTo(1, 5);
    expect(result.fees).toBe(0.5);
    expect(result.slippage).toBe(0.25);
    expect(result.netReturn).toBeCloseTo(0.25, 5);
    expect(result.annualizedNetRate).toBeGreaterThan(0);
  });

  it("produces negative net when fees exceed funding", () => {
    const result = estimateSpotPerpReturns({
      ...base,
      fees: 2,
    });
    // gross = $1, fees = $2, net = $1 - $2 - $0.25 = -$1.25
    expect(result.netReturn).toBeCloseTo(-1.25, 5);
    expect(result.annualizedNetRate).toBeLessThan(0);
  });

  it("handles multiple funding settlements over longer holding period", () => {
    const result = estimateSpotPerpReturns({
      ...base,
      holding: { holdingHours: 24, fundingIntervalHours: 8 },
    });
    // gross = 0.001 * 1000 * (24/8) = $3
    // net = 3 - 0.5 - 0.25 = $2.25
    expect(result.grossReturn).toBeCloseTo(3, 5);
    expect(result.netReturn).toBeCloseTo(2.25, 5);
  });

  it("uses default holding hours when not provided", () => {
    const result = estimateSpotPerpReturns({
      ...base,
      holding: undefined,
    });
    expect(result.holdingHours).toBe(8);
  });
});

describe("estimateCrossExchangeReturns", () => {
  const base: ExecutionEstimateInput = estimateInput({
    opportunityType: "cross-exchange",
    annualizedRate: 21.5,
    notionalUsd: 1000,
    fees: 1.0,
    slippage: 0.5,
    holding: { holdingHours: 8 },
  });

  it("computes returns from annualized rate", () => {
    // gross = (21.5/100) * (8/8760) * 1000 ≈ $0.196
    const result = estimateCrossExchangeReturns(base);
    const expectedGross = (21.5 / 100) * (8 / HOURS_PER_YEAR) * 1000;
    expect(result.grossReturn).toBeCloseTo(expectedGross, 5);
    expect(result.netReturn).toBeCloseTo(expectedGross - 1.0 - 0.5, 5);
  });
});

describe("estimateBasisReturns", () => {
  it("computes returns for a basis opportunity", () => {
    const input = estimateInput({
      opportunityType: "basis",
      annualizedRate: 8.5,
      notionalUsd: 1000,
      fees: 0.5,
      slippage: 0.25,
    });
    const result = estimateBasisReturns(input);
    const expectedGross = (8.5 / 100) * (8 / HOURS_PER_YEAR) * 1000;
    expect(result.grossReturn).toBeCloseTo(expectedGross, 5);
    expect(result.holdingHours).toBe(8);
  });
});

describe("estimateExecutionReturns", () => {
  it("routes spot-perp correctly", () => {
    const input = estimateInput({
      opportunityType: "spot-perp",
      fundingRate: 0.001,
      notionalUsd: 1000,
    });
    const result = estimateExecutionReturns(input);
    expect(result.grossReturn).toBeCloseTo(1, 5);
  });

  it("routes cross-exchange correctly", () => {
    const input = estimateInput({
      opportunityType: "cross-exchange",
      annualizedRate: 30,
      notionalUsd: 1000,
    });
    const result = estimateExecutionReturns(input);
    const expectedGross = (30 / 100) * (8 / HOURS_PER_YEAR) * 1000;
    expect(result.grossReturn).toBeCloseTo(expectedGross, 5);
  });

  it("routes basis correctly", () => {
    const input = estimateInput({
      opportunityType: "basis",
      annualizedRate: 12,
      notionalUsd: 1000,
    });
    const result = estimateExecutionReturns(input);
    const expectedGross = (12 / 100) * (8 / HOURS_PER_YEAR) * 1000;
    expect(result.grossReturn).toBeCloseTo(expectedGross, 5);
  });
});
