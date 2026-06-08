import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockSandboxTradingAdapter, resetMockSandboxCounter } from "./mockSandboxTradingAdapter";
import type { OrderPreview } from "../orders/orderPreviewTypes";
import type { ConfirmationRecord } from "../orders/orderConfirmationTypes";

beforeEach(() => {
  resetMockSandboxCounter();
});

/** Cross-exchange preview with 2 legs on different venues. */
const mockCrossPreview: OrderPreview = {
  id: "preview-test-1",
  mode: "preview",
  opportunityId: "opp-1",
  symbol: "BTC/USDT",
  base: "BTC",
  quote: "USDT",
  opportunityType: "cross-exchange",
  strategyName: "Balanced",
  legs: [
    { venue: "Binance", marketType: "perp", side: "short", symbol: "BTC/USDT", notionalUsd: 500, estimatedEntryPrice: 68000, reduceOnly: false, orderType: "market", status: "preview-only" },
    { venue: "OKX", marketType: "perp", side: "long", symbol: "BTC/USDT", notionalUsd: 500, estimatedEntryPrice: 67900, reduceOnly: false, orderType: "market", status: "preview-only" },
  ],
  estimatedFees: 1.0,
  estimatedSlippage: 0.5,
  estimatedNetRate: 18.0,
  scoringResult: {} as any,
  riskGateResult: { allowed: true, severity: "info", reasonCodes: ["PASS"], messages: [], checks: [] },
  estimateResult: {} as any,
  accountRiskContextSource: "mock",
  submittable: true,
  warnings: [],
  createdAt: 1_700_000_000_000,
};

const mockConfirmation: ConfirmationRecord = {
  id: "cf-test-1",
  previewId: "preview-test-1",
  opportunityId: "opp-1",
  symbol: "BTC/USDT",
  strategyName: "Balanced",
  confirmedAt: 1_700_000_000_100,
  confirmedBy: "local-user",
  status: "confirmed-preview-only",
  riskAccepted: true,
  riskMessages: [],
  disclaimerAccepted: true,
  previewSnapshot: mockCrossPreview,
};

describe("mockSandboxTradingAdapter", () => {
  const adapter = createMockSandboxTradingAdapter("Binance");

  it("has correct identity", () => {
    expect(adapter.exchangeId).toBe("Binance");
    expect(adapter.mode).toBe("design-only");
  });

  it("validateEnvironment returns mock passed with sandbox env", async () => {
    const result = await adapter.validateEnvironment();
    expect(result.valid).toBe(true);
    expect(result.environment).toBe("sandbox");
    expect(result.warnings.some((w) => w.includes("Mock"))).toBe(true);
  });

  it("validatePermissions returns passed with mock warning", async () => {
    const result = await adapter.validatePermissions();
    expect(result.valid).toBe(true);
    expect(result.canTrade).toBe(true);
    expect(result.canWithdraw).toBe(false);
    expect(result.warnings.some((w) => w.includes("Mock"))).toBe(true);
  });

  describe("buildSandboxOrderRequests", () => {
    it("returns one request per leg for cross-exchange preview", () => {
      const requests = adapter.buildSandboxOrderRequests(mockCrossPreview, mockConfirmation);
      expect(requests).toHaveLength(2);
    });

    it("first leg request has Binance venue with short side", () => {
      const requests = adapter.buildSandboxOrderRequests(mockCrossPreview, mockConfirmation);
      expect(requests[0].exchangeId).toBe("Binance");
      expect(requests[0].side).toBe("short");
      expect(requests[0].notionalUsd).toBe(500);
      expect(requests[0].marketType).toBe("perp");
    });

    it("second leg request has OKX venue with long side", () => {
      const requests = adapter.buildSandboxOrderRequests(mockCrossPreview, mockConfirmation);
      expect(requests[1].exchangeId).toBe("OKX");
      expect(requests[1].side).toBe("long");
      expect(requests[1].notionalUsd).toBe(500);
    });

    it("each request has previewId and confirmationId", () => {
      const requests = adapter.buildSandboxOrderRequests(mockCrossPreview, mockConfirmation);
      for (const req of requests) {
        expect(req.previewId).toBe("preview-test-1");
        expect(req.confirmationId).toBe("cf-test-1");
      }
    });

    it("no two requests share the same clientOrderId", () => {
      const requests = adapter.buildSandboxOrderRequests(mockCrossPreview, mockConfirmation);
      const ids = requests.map((r) => r.clientOrderId);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("fallback generates a single request when preview has no legs", () => {
      const leglessPreview = { ...mockCrossPreview, legs: [] };
      const requests = adapter.buildSandboxOrderRequests(leglessPreview, mockConfirmation);
      expect(requests).toHaveLength(1);
      expect(requests[0].exchangeId).toBe("Binance");
      expect(requests[0].side).toBe("buy");
    });
  });

  it("submitSandboxOrder returns mock-sandbox result", async () => {
    const requests = adapter.buildSandboxOrderRequests(mockCrossPreview, mockConfirmation);
    const result = await adapter.submitSandboxOrder(requests[0]);
    expect(result.orderId).toMatch(/^mock-sandbox-Binance-\d+/);
    expect(result.status).toBe("sandbox-submitted");
    expect(result.source).toBe("mock-sandbox");
    expect(result.fee).toBe(0);
    expect(result.filledQuantity).toBe(0);
    expect(result.submittedAt).toBeGreaterThan(0);
    expect(result.errorMessage).toBeUndefined();
  });

  it("cancelSandboxOrder returns true", async () => {
    const cancelled = await adapter.cancelSandboxOrder("mock-order-id");
    expect(cancelled).toBe(true);
  });

  it("getSandboxOrderStatus returns mock filled status", async () => {
    const result = await adapter.getSandboxOrderStatus("mock-order-id");
    expect(result.status).toBe("sandbox-filled");
    expect(result.source).toBe("mock-sandbox");
    expect(result.filledPrice).toBeGreaterThan(0);
    expect(result.fee).toBeGreaterThan(0);
  });

  it("does not require API Key", () => {
    const noKeyAdapter = createMockSandboxTradingAdapter("OKX");
    expect(noKeyAdapter.exchangeId).toBe("OKX");
  });

  it("creates unique order IDs across multiple submissions", async () => {
    const requests = adapter.buildSandboxOrderRequests(mockCrossPreview, mockConfirmation);
    const r1 = await adapter.submitSandboxOrder(requests[0]);
    const r2 = await adapter.submitSandboxOrder(requests[0]);
    expect(r1.orderId).not.toBe(r2.orderId);
  });
});

// ─── Static analysis: mock adapter has no fetch/axios/SDK ──

describe("mockSandboxTradingAdapter — static analysis", () => {
  it("implementation file does not contain fetch / axios / SDK import", () => {
    const content = readFileSync(join(__dirname, "mockSandboxTradingAdapter.ts"), "utf8");
    const importLines = content.split("\n").filter((l) => l.includes("from "));
    for (const line of importLines) {
      expect(line, `Import line contains forbidden dependency: ${line.trim()}`).not.toMatch(/fetch|axios|node-fetch|cross-fetch/i);
    }
  });
});
