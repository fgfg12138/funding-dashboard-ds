import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaperExecution } from "./types";
import {
  clearPaperExecutions,
  closePaperExecution,
  createPaperExecution,
  listClosedExecutions,
  listOpenExecutions,
  listPaperExecutions,
} from "./executionStore";

/** Minimal localStorage mock for Node.js test environment. */
function createMockStorage() {
  let store: Record<string, string> = {};
  return {
    getItem(key: string) { return store[key] ?? null; },
    setItem(key: string, value: string) { store[key] = value; },
    removeItem(key: string) { delete store[key]; },
    clear() { store = {}; },
    get length() { return Object.keys(store).length; },
    key(index: number) { return Object.keys(store)[index] ?? null; },
  };
}

const sampleExecution: PaperExecution = {
  id: "paper-test-1",
  opportunityId: "opp-1",
  opportunityType: "cross-exchange",
  symbol: "BTC/USDT",
  base: "BTC",
  quote: "USDT",
  mode: "paper",
  status: "opened",
  legs: [
    {
      id: "leg-1",
      venue: "Binance",
      marketType: "perp",
      side: "short",
      symbol: "BTC/USDT",
      notionalUsd: 1000,
      estimatedEntryPrice: 0,
      estimatedFee: 1,
      estimatedSlippage: 0.5,
    },
  ],
  sideDescription: "Short Binance / Long OKX",
  exchanges: ["Binance", "OKX"],
  estimatedAnnualizedRate: 21.5,
  estimatedFundingRate: 0.001,
  estimatedFees: 1,
  estimatedSlippage: 0.5,
  estimatedNetRate: 20.0,
  riskTags: [],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  openedAt: 1_700_000_000_000,
  closedAt: null,
  closeReason: null,
};

beforeEach(() => {
  vi.stubGlobal("localStorage", createMockStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("executionStore", () => {
  it("stores an execution and retrieves it", () => {
    createPaperExecution(sampleExecution);
    const all = listPaperExecutions();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("paper-test-1");
  });

  it("filters open vs closed executions", () => {
    const closedOne: PaperExecution = {
      ...sampleExecution,
      id: "paper-test-2",
      status: "closed",
      closedAt: 1_700_000_001_000,
    };

    createPaperExecution(sampleExecution);
    createPaperExecution(closedOne);

    expect(listOpenExecutions()).toHaveLength(1);
    expect(listClosedExecutions()).toHaveLength(1);
  });

  it("closes an execution and updates timestamps", () => {
    createPaperExecution(sampleExecution);
    const result = closePaperExecution({ id: "paper-test-1", now: 1_700_000_002_000 });
    expect(result).toBeDefined();
    expect(result![0].status).toBe("closed");
    expect(result![0].closedAt).toBe(1_700_000_002_000);
    expect(result![0].updatedAt).toBe(1_700_000_002_000);
  });

  it("returns undefined when closing a non-existent execution", () => {
    const result = closePaperExecution({ id: "non-existent" });
    expect(result).toBeUndefined();
  });

  it("clears all executions", () => {
    createPaperExecution(sampleExecution);
    expect(listPaperExecutions()).toHaveLength(1);
    clearPaperExecutions();
    expect(listPaperExecutions()).toHaveLength(0);
  });
});
