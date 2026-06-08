/**
 * Testnet Request Validation Tests — Phase 5.20
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateTestnetRequestValidation } from "./testnetRequestValidation";
import type { TestnetRequestValidationInput } from "./testnetRequestValidationTypes";

const BASE_INPUT: TestnetRequestValidationInput = {
  routeName: "orders-preview-submit",
  method: "POST",
  payload: {
    exchangeId: "binance",
    symbol: "BTCUSDT",
    side: "Buy",
    orderType: "Market",
    quantity: 0.01,
  },
  phase: "5.20-request-validation-skeleton",
};

function makeInput(overrides?: Partial<TestnetRequestValidationInput>): TestnetRequestValidationInput {
  return { ...BASE_INPUT, ...overrides };
}

// ─── Payload Missing ─────────────────────────────────────

describe("evaluateTestnetRequestValidation", () => {
  it("blocks when payload is null", () => {
    const result = evaluateTestnetRequestValidation(makeInput({ payload: null }));
    expect(result.valid).toBe(false);
    expect(result.reasonCodes).toContain("PAYLOAD_MISSING");
    expect(result.source).toBe("testnet-request-validation-skeleton");
  });

  it("blocks when payload is undefined", () => {
    const result = evaluateTestnetRequestValidation(makeInput({ payload: undefined }));
    expect(result.valid).toBe(false);
    expect(result.reasonCodes).toContain("PAYLOAD_MISSING");
  });

  // ─── Exchange ID ──────────────────────────────────────

  it("blocks when exchangeId is missing", () => {
    const customPayload = { ...BASE_INPUT.payload } as Record<string, unknown>;
    delete customPayload.exchangeId;
    const result = evaluateTestnetRequestValidation(makeInput({ payload: customPayload }));
    expect(result.valid).toBe(false);
    expect(result.reasonCodes).toContain("EXCHANGE_ID_MISSING");
  });

  it("blocks when exchangeId is invalid", () => {
    const result = evaluateTestnetRequestValidation(makeInput({ payload: { ...BASE_INPUT.payload, exchangeId: "kraken" } }));
    expect(result.valid).toBe(false);
    expect(result.reasonCodes).toContain("INVALID_EXCHANGE_ID");
  });

  it("allows binance, okx, bybit", () => {
    for (const id of ["binance", "okx", "bybit"] as const) {
      const result = evaluateTestnetRequestValidation(makeInput({ payload: { ...BASE_INPUT.payload, exchangeId: id } }));
      expect(result.valid).toBe(true);
    }
  });

  // ─── Submit Route ─────────────────────────────────────

  describe("submit route validation", () => {
    it("blocks when symbol is missing", () => {
      const result = evaluateTestnetRequestValidation(makeInput({ payload: { ...BASE_INPUT.payload, symbol: "" } }));
      expect(result.reasonCodes).toContain("SYMBOL_MISSING");
    });

    it("blocks when side is invalid", () => {
      const result = evaluateTestnetRequestValidation(makeInput({ payload: { ...BASE_INPUT.payload, side: "Invalid" } }));
      expect(result.reasonCodes).toContain("INVALID_SIDE");
    });

    it("blocks when orderType is invalid", () => {
      const result = evaluateTestnetRequestValidation(makeInput({ payload: { ...BASE_INPUT.payload, orderType: "Stop" } }));
      expect(result.reasonCodes).toContain("INVALID_ORDER_TYPE");
    });

    it("blocks when quantity is 0", () => {
      const result = evaluateTestnetRequestValidation(makeInput({ payload: { ...BASE_INPUT.payload, quantity: 0 } }));
      expect(result.reasonCodes).toContain("INVALID_QUANTITY");
    });

    it("blocks when quantity is negative", () => {
      const result = evaluateTestnetRequestValidation(makeInput({ payload: { ...BASE_INPUT.payload, quantity: -1 } }));
      expect(result.reasonCodes).toContain("INVALID_QUANTITY");
    });

    it("blocks Limit order without price", () => {
      const result = evaluateTestnetRequestValidation(
        makeInput({ payload: { ...BASE_INPUT.payload, orderType: "Limit", price: undefined } }),
      );
      expect(result.reasonCodes).toContain("LIMIT_PRICE_REQUIRED");
    });

    it("blocks Limit order with price <= 0", () => {
      const result = evaluateTestnetRequestValidation(
        makeInput({ payload: { ...BASE_INPUT.payload, orderType: "Limit", price: 0 } }),
      );
      expect(result.reasonCodes).toContain("LIMIT_PRICE_REQUIRED");
    });

    it("allows valid Limit order with price", () => {
      const result = evaluateTestnetRequestValidation(
        makeInput({ payload: { ...BASE_INPUT.payload, orderType: "Limit", price: 50000 } }),
      );
      expect(result.valid).toBe(true);
    });

    it("allows valid Market order", () => {
      const result = evaluateTestnetRequestValidation(makeInput());
      expect(result.valid).toBe(true);
    });
  });

  // ─── Cancel/Status Route ──────────────────────────────

  describe("cancel/status route validation", () => {
    it("blocks cancel when orderId is missing", () => {
      const result = evaluateTestnetRequestValidation(
        makeInput({ routeName: "orders-cancel", payload: { exchangeId: "binance", orderId: "" } }),
      );
      expect(result.reasonCodes).toContain("ORDER_ID_MISSING");
    });

    it("blocks status when orderId is missing", () => {
      const result = evaluateTestnetRequestValidation(
        makeInput({ routeName: "orders-status", payload: { exchangeId: "binance", orderId: "" } }),
      );
      expect(result.reasonCodes).toContain("ORDER_ID_MISSING");
    });

    it("allows valid cancel request", () => {
      const result = evaluateTestnetRequestValidation(
        makeInput({ routeName: "orders-cancel", payload: { exchangeId: "binance", orderId: "order-001" } }),
      );
      expect(result.valid).toBe(true);
    });
  });

  // ─── Account Snapshot ─────────────────────────────────

  describe("account-snapshot validation", () => {
    it("allows account-snapshot with valid exchangeId", () => {
      const result = evaluateTestnetRequestValidation(
        makeInput({ routeName: "account-snapshot", payload: { exchangeId: "binance" } }),
      );
      expect(result.valid).toBe(true);
    });
  });

  // ─── Sensitive Fields ────────────────────────────────

  describe("sensitive field handling", () => {
    it("blocks when payload contains secret fields", () => {
      const result = evaluateTestnetRequestValidation(
        makeInput({ payload: { ...BASE_INPUT.payload, apiSecret: "sk-abc123" } }),
      );
      expect(result.reasonCodes).toContain("SENSITIVE_FIELDS_DETECTED");
    });

    it("removes sensitive fields from sanitizedPayload", () => {
      const result = evaluateTestnetRequestValidation(
        makeInput({ payload: { ...BASE_INPUT.payload, apiSecret: "sk-abc123", password: "p@ss" } }),
      );
      expect(result.sanitizedPayload).toBeDefined();
      expect(result.sanitizedPayload!["apiSecret"]).toBeUndefined();
      expect(result.sanitizedPayload!["password"]).toBeUndefined();
      expect(result.sanitizedPayload!["_apiSecret_redacted"]).toBe(true);
    });

    it("does not block non-sensitive fields", () => {
      const result = evaluateTestnetRequestValidation(
        makeInput({ payload: { ...BASE_INPUT.payload, someMetadata: "safe-data" } }),
      );
      expect(result.valid).toBe(true);
      expect(result.sanitizedPayload!["someMetadata"]).toBe("safe-data");
    });
  });

  // ─── Source ──────────────────────────────────────────

  describe("source", () => {
    it("is testnet-request-validation-skeleton", () => {
      const result = evaluateTestnetRequestValidation(makeInput());
      expect(result.source).toBe("testnet-request-validation-skeleton");

      const result2 = evaluateTestnetRequestValidation(makeInput({ payload: null }));
      expect(result2.source).toBe("testnet-request-validation-skeleton");
    });
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("testnetRequestValidation — static analysis", () => {
  const content = readFileSync(join(__dirname, "testnetRequestValidation.ts"), "utf8");

  it("does not contain fetch(", () => {
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(noComments).not.toContain("fetch(");
  });

  it("does not contain axios", () => {
    expect(content).not.toContain("axios");
  });

  it("does not contain createHmac / crypto.subtle.sign", () => {
    expect(content).not.toContain("createHmac");
    expect(content).not.toContain("crypto.subtle.sign");
  });

  it("does not contain decryptSecret / importMasterKey / apiKeyStore", () => {
    expect(content).not.toContain("decryptSecret");
    expect(content).not.toContain("importMasterKey");
    expect(content).not.toContain("apiKeyStore");
  });
});
