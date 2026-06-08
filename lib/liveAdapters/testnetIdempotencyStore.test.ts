/**
 * Testnet Idempotency Store Skeleton Tests — Phase 5.12
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import {
  createIdempotencyRecord,
  findIdempotencyRecord,
  markDuplicateBlocked,
  expireIdempotencyRecord,
  listIdempotencyRecords,
  clearIdempotencyRecords,
  buildRequestHash,
  resetIdempotencyStore,
} from "./testnetIdempotencyStore";
import type { TestnetIdempotencyInput } from "./testnetIdempotencyTypes";

const BASE_INPUT: TestnetIdempotencyInput = {
  idempotencyKey: "idem-001",
  clientOrderId: "client-order-001",
  routeName: "orders-preview-submit",
  exchangeId: "binance",
  requestFields: { symbol: "BTCUSDT", side: "Buy", quantity: 0.01 },
  responseSnapshot: {
    success: false,
    errorCode: "exchange-env-invalid",
    message: "Testnet route skeleton only — no network request, no order placement",
    httpStatus: 403,
  },
};

function makeInput(overrides?: Partial<TestnetIdempotencyInput>): TestnetIdempotencyInput {
  return { ...BASE_INPUT, ...overrides };
}

describe("testnetIdempotencyStore", () => {
  beforeEach(() => {
    resetIdempotencyStore();
  });

  // ─── buildRequestHash ────────────────────────────────

  describe("buildRequestHash", () => {
    it("returns a deterministic hash string", () => {
      const hash1 = buildRequestHash({ symbol: "BTCUSDT", side: "Buy" });
      const hash2 = buildRequestHash({ symbol: "BTCUSDT", side: "Buy" });
      expect(hash1).toBe(hash2);
    });

    it("returns different hash for different input", () => {
      const hash1 = buildRequestHash({ symbol: "BTCUSDT" });
      const hash2 = buildRequestHash({ symbol: "ETHUSDT" });
      expect(hash1).not.toBe(hash2);
    });

    it("starts with sk-hash- prefix", () => {
      const hash = buildRequestHash({ symbol: "BTCUSDT" });
      expect(hash).toMatch(/^sk-hash-/);
    });
  });

  // ─── createIdempotencyRecord ─────────────────────────

  describe("createIdempotencyRecord", () => {
    it("creates a record with recorded-blocked status", () => {
      const { record, isDuplicate } = createIdempotencyRecord(makeInput());
      expect(record.status).toBe("recorded-blocked");
      expect(record.source).toBe("testnet-route-skeleton");
      expect(isDuplicate).toBe(false);
    });

    it("assigns an id", () => {
      const { record } = createIdempotencyRecord(makeInput());
      expect(record.id).toBeTruthy();
      expect(record.id).toMatch(/^idem-/);
    });

    it("stores the response snapshot", () => {
      const { record } = createIdempotencyRecord(makeInput());
      expect(record.responseSnapshot.success).toBe(false);
      expect(record.responseSnapshot.httpStatus).toBe(403);
    });

    it("sets createdAt, updatedAt, expiresAt", () => {
      const { record } = createIdempotencyRecord(makeInput());
      expect(record.createdAt).toBeGreaterThan(0);
      expect(record.updatedAt).toBeGreaterThan(0);
      expect(record.expiresAt).toBeGreaterThan(record.createdAt);
    });
  });

  // ─── Dedup ────────────────────────────────────────────

  describe("dedup — same idempotencyKey + routeName", () => {
    it("returns isDuplicate=true for second call with same key", () => {
      createIdempotencyRecord(makeInput());
      const { record, isDuplicate } = createIdempotencyRecord(makeInput());
      expect(isDuplicate).toBe(true);
      expect(record.status).toBe("duplicate-blocked");
    });

    it("treats different routeName as non-duplicate", () => {
      createIdempotencyRecord(makeInput({ routeName: "orders-preview-submit" }));
      const { isDuplicate } = createIdempotencyRecord(makeInput({ routeName: "orders-cancel" }));
      expect(isDuplicate).toBe(false);
    });

    it("treats different idempotencyKey as non-duplicate", () => {
      createIdempotencyRecord(makeInput({ idempotencyKey: "key-001" }));
      const { isDuplicate } = createIdempotencyRecord(makeInput({ idempotencyKey: "key-002" }));
      expect(isDuplicate).toBe(false);
    });
  });

  // ─── findIdempotencyRecord ────────────────────────────

  describe("findIdempotencyRecord", () => {
    it("finds existing record by key + route", () => {
      createIdempotencyRecord(makeInput());
      const found = findIdempotencyRecord("idem-001", "orders-preview-submit");
      expect(found).toBeDefined();
      expect(found!.idempotencyKey).toBe("idem-001");
    });

    it("returns undefined for non-existent key", () => {
      const found = findIdempotencyRecord("does-not-exist", "orders-preview-submit");
      expect(found).toBeUndefined();
    });
  });

  // ─── expireIdempotencyRecord ──────────────────────────

  describe("expireIdempotencyRecord", () => {
    it("marks record as expired", () => {
      const { record } = createIdempotencyRecord(makeInput());
      expireIdempotencyRecord(record.id);
      expect(record.status).toBe("expired");
      const found = findIdempotencyRecord("idem-001", "orders-preview-submit");
      expect(found).toBeUndefined();
    });
  });

  // ─── markDuplicateBlocked ─────────────────────────────

  describe("markDuplicateBlocked", () => {
    it("marks record as duplicate-blocked", () => {
      const { record } = createIdempotencyRecord(makeInput());
      markDuplicateBlocked(record.id);
      expect(record.status).toBe("duplicate-blocked");
    });
  });

  // ─── listIdempotencyRecords ───────────────────────────

  describe("listIdempotencyRecords", () => {
    it("returns all records", () => {
      createIdempotencyRecord(makeInput({ idempotencyKey: "first" }));
      createIdempotencyRecord(makeInput({ idempotencyKey: "second" }));
      const list = listIdempotencyRecords();
      expect(list.length).toBe(2);
    });

    it("returns empty array after clear", () => {
      createIdempotencyRecord(makeInput());
      clearIdempotencyRecords();
      expect(listIdempotencyRecords()).toEqual([]);
    });
  });

  // ─── clearIdempotencyRecords ──────────────────────────

  describe("clearIdempotencyRecords", () => {
    it("removes all records", () => {
      createIdempotencyRecord(makeInput());
      createIdempotencyRecord(makeInput({ idempotencyKey: "another" }));
      clearIdempotencyRecords();
      expect(listIdempotencyRecords()).toEqual([]);
    });
  });

  // ─── source ────────────────────────────────────────────

  describe("source", () => {
    it("always returns testnet-route-skeleton", () => {
      const { record } = createIdempotencyRecord(makeInput());
      expect(record.source).toBe("testnet-route-skeleton");

      const { record: record2 } = createIdempotencyRecord(
        makeInput({ idempotencyKey: "key-002", routeName: "orders-cancel" }),
      );
      expect(record2.source).toBe("testnet-route-skeleton");
    });
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("testnetIdempotencyStore — static analysis", () => {
  const content = readFileSync(join(__dirname, "testnetIdempotencyStore.ts"), "utf8");

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

  it("does not contain decryptSecret / importMasterKey", () => {
    expect(content).not.toContain("decryptSecret");
    expect(content).not.toContain("importMasterKey");
  });
});
