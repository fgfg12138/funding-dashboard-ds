import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OrderPreview } from "./orderPreviewTypes";
import type { ScoreResult } from "../opportunity/scoring";
import { clearConfirmations, createConfirmation, getConfirmation, listConfirmations, resetConfirmationIdCounter } from "./orderConfirmationStore";

// Helper: build a minimal OrderPreview for tests
function makePreview(overrides: Partial<OrderPreview> = {}): OrderPreview {
  return {
    id: "preview-test-1",
    mode: "preview",
    opportunityId: "opp-1",
    symbol: "BTC/USDT",
    base: "BTC",
    quote: "USDT",
    opportunityType: "cross-exchange",
    strategyName: "Balanced Funding",
    legs: [],
    estimatedFees: 1.0,
    estimatedSlippage: 0.5,
    estimatedNetRate: 18.0,
    scoringResult: { score: 82, grade: "B", riskLevel: "low", reasonCodes: [], warnings: [], components: { returnScore: 85, costScore: 70, liquidityScore: 80, riskPenalty: 5, confidenceScore: 85 } },
    riskGateResult: { allowed: true, severity: "info", reasonCodes: ["PASS"], messages: [], checks: [] },
    estimateResult: { grossReturn: 2.5, fees: 1.0, slippage: 0.5, netReturn: 1.0, netRate: 0.001, annualizedNetRate: 12.5, holdingHours: 8 },
    accountRiskContextSource: "mock",
    submittable: true,
    warnings: ["Mock 数据"],
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

// Set up localStorage
const storage: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => { storage[k] = v; },
    removeItem: (k: string) => { delete storage[k]; },
    clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
  },
  writable: true,
  configurable: true,
});

beforeEach(() => {
  Object.keys(storage).forEach((k) => delete storage[k]);
  resetConfirmationIdCounter();
});

describe("createConfirmation", () => {
  it("creates a confirmation record with correct fields", () => {
    const record = createConfirmation({
      preview: makePreview(),
      riskAccepted: true,
      disclaimerAccepted: true,
    });

    expect(record.id).toMatch(/^confirm-/);
    expect(record.previewId).toBe("preview-test-1");
    expect(record.symbol).toBe("BTC/USDT");
    expect(record.strategyName).toBe("Balanced Funding");
    expect(record.confirmedBy).toBe("local-user");
    expect(record.status).toBe("confirmed-preview-only");
    expect(record.riskAccepted).toBe(true);
    expect(record.disclaimerAccepted).toBe(true);
  });

  it("includes preview snapshot in record", () => {
    const preview = makePreview();
    const record = createConfirmation({ preview, riskAccepted: true, disclaimerAccepted: true });

    expect(record.previewSnapshot.id).toBe("preview-test-1");
    expect(record.previewSnapshot.opportunityId).toBe("opp-1");
    expect(record.riskMessages).toEqual(preview.warnings);
  });

  it("throws when riskAccepted is false", () => {
    expect(() =>
      createConfirmation({ preview: makePreview(), riskAccepted: false, disclaimerAccepted: true }),
    ).toThrow("风险确认未勾选");
  });

  it("throws when disclaimerAccepted is false", () => {
    expect(() =>
      createConfirmation({ preview: makePreview(), riskAccepted: true, disclaimerAccepted: false }),
    ).toThrow("免责声明未勾选");
  });

  it("throws when preview is not submittable (riskGate blocked)", () => {
    expect(() =>
      createConfirmation({
        preview: makePreview({ submittable: false }),
        riskAccepted: true,
        disclaimerAccepted: true,
      }),
    ).toThrow("风控未通过");
  });

  it("persists to localStorage and can be listed", () => {
    createConfirmation({ preview: makePreview(), riskAccepted: true, disclaimerAccepted: true });

    const all = listConfirmations();
    expect(all).toHaveLength(1);
    expect(all[0].previewId).toBe("preview-test-1");
  });

  it("can retrieve by id", () => {
    const record = createConfirmation({ preview: makePreview(), riskAccepted: true, disclaimerAccepted: true });
    const found = getConfirmation(record.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(record.id);
  });
});

describe("clearConfirmations", () => {
  it("removes all records", () => {
    createConfirmation({ preview: makePreview(), riskAccepted: true, disclaimerAccepted: true });
    expect(listConfirmations()).toHaveLength(1);
    clearConfirmations();
    expect(listConfirmations()).toHaveLength(0);
  });
});
