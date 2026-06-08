/**
 * Testnet Audit Server Event Store Tests — Phase 5.14
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import {
  createTestnetAuditEvent,
  listTestnetAuditEvents,
  filterTestnetAuditEvents,
  clearTestnetAuditEvents,
  countTestnetAuditEventsByType,
  buildTestnetRequestId,
  resetAuditStore,
} from "./testnetAuditStore";
import type { TestnetAuditEventInput } from "./testnetAuditTypes";

const BASE_INPUT: TestnetAuditEventInput = {
  eventType: "route_skeleton_blocked",
  routeName: "orders-preview-submit",
  method: "POST",
  exchangeId: "binance",
  requestId: "sk-audit-test-001",
  severity: "blocked",
  message: "Skeleton blocked — no real trading",
};

function makeInput(overrides?: Partial<TestnetAuditEventInput>): TestnetAuditEventInput {
  return { ...BASE_INPUT, ...overrides };
}

describe("testnetAuditStore", () => {
  beforeEach(() => {
    resetAuditStore();
  });

  // ─── buildTestnetRequestId ───────────────────────────

  describe("buildTestnetRequestId", () => {
    it("starts with sk-audit- prefix", () => {
      const id = buildTestnetRequestId("orders-preview-submit", "binance");
      expect(id).toMatch(/^sk-audit-/);
    });

    it("includes route name and exchange", () => {
      const id = buildTestnetRequestId("orders-cancel", "okx");
      expect(id).toContain("orders-cancel");
      expect(id).toContain("okx");
    });

    it("produces unique IDs on successive calls", () => {
      const a = buildTestnetRequestId("orders-preview-submit", "binance");
      const b = buildTestnetRequestId("orders-preview-submit", "binance");
      expect(a).not.toBe(b);
    });
  });

  // ─── createTestnetAuditEvent ─────────────────────────

  describe("createTestnetAuditEvent", () => {
    it("creates an event with generated id and timestamp", () => {
      const event = createTestnetAuditEvent(makeInput());
      expect(event.id).toMatch(/^audit-/);
      expect(event.createdAt).toBeGreaterThan(0);
      expect(event.source).toBe("testnet-route-skeleton");
    });

    it("stores all input fields correctly", () => {
      const event = createTestnetAuditEvent(
        makeInput({
          eventType: "route_request_blocked",
          routeName: "orders-cancel",
          method: "POST",
          exchangeId: "okx",
          idempotencyKey: "idem-key-001",
          clientOrderId: "client-order-001",
          errorCode: "exchange-env-invalid",
          severity: "blocked",
          metadata: { reason: "test", count: 3 },
        }),
      );

      expect(event.eventType).toBe("route_request_blocked");
      expect(event.routeName).toBe("orders-cancel");
      expect(event.method).toBe("POST");
      expect(event.exchangeId).toBe("okx");
      expect(event.idempotencyKey).toBe("idem-key-001");
      expect(event.clientOrderId).toBe("client-order-001");
      expect(event.errorCode).toBe("exchange-env-invalid");
      expect(event.metadata.reason).toBe("test");
      expect(event.metadata.count).toBe(3);
    });

    it("defaults metadata to empty object", () => {
      const event = createTestnetAuditEvent(makeInput());
      expect(event.metadata).toEqual({});
    });
  });

  // ─── listTestnetAuditEvents ──────────────────────────

  describe("listTestnetAuditEvents", () => {
    it("returns all events in order", () => {
      const event1 = createTestnetAuditEvent(makeInput({ requestId: "first", routeName: "orders-preview-submit" }));
      const event2 = createTestnetAuditEvent(makeInput({ requestId: "second", routeName: "orders-cancel" }));

      const list = listTestnetAuditEvents();
      expect(list.length).toBe(2);
    });

    it("returns empty array after clear", () => {
      createTestnetAuditEvent(makeInput());
      clearTestnetAuditEvents();
      expect(listTestnetAuditEvents()).toEqual([]);
    });
  });

  // ─── filterTestnetAuditEvents ────────────────────────

  describe("filterTestnetAuditEvents", () => {
    it("filters by routeName", () => {
      createTestnetAuditEvent(makeInput({ routeName: "orders-preview-submit" }));
      createTestnetAuditEvent(makeInput({ routeName: "orders-cancel" }));

      const filtered = filterTestnetAuditEvents({ routeName: "orders-cancel" });
      expect(filtered.length).toBe(1);
      expect(filtered[0].routeName).toBe("orders-cancel");
    });

    it("filters by eventType", () => {
      createTestnetAuditEvent(makeInput({ eventType: "route_skeleton_blocked" }));
      createTestnetAuditEvent(makeInput({ eventType: "route_rate_limited" }));

      const filtered = filterTestnetAuditEvents({ eventType: "route_skeleton_blocked" });
      expect(filtered.length).toBe(1);
    });

    it("filters by severity", () => {
      createTestnetAuditEvent(makeInput({ severity: "blocked" }));
      createTestnetAuditEvent(makeInput({ severity: "info", eventType: "route_request_received" }));

      const filtered = filterTestnetAuditEvents({ severity: "info" });
      expect(filtered.length).toBe(1);
    });

    it("filters by exchangeId", () => {
      createTestnetAuditEvent(makeInput({ exchangeId: "binance" }));
      createTestnetAuditEvent(makeInput({ exchangeId: "okx" }));

      const filtered = filterTestnetAuditEvents({ exchangeId: "okx" });
      expect(filtered.length).toBe(1);
    });

    it("returns all events when no filters applied", () => {
      createTestnetAuditEvent(makeInput());
      createTestnetAuditEvent(makeInput());
      const filtered = filterTestnetAuditEvents({});
      expect(filtered.length).toBe(2);
    });
  });

  // ─── countTestnetAuditEventsByType ───────────────────

  describe("countTestnetAuditEventsByType", () => {
    it("returns zero for all types when empty", () => {
      const counts = countTestnetAuditEventsByType();
      for (const t of Object.keys(counts)) {
        expect(counts[t as keyof typeof counts]).toBe(0);
      }
    });

    it("counts correctly by type", () => {
      createTestnetAuditEvent(makeInput({ eventType: "route_skeleton_blocked" }));
      createTestnetAuditEvent(makeInput({ eventType: "route_skeleton_blocked" }));
      createTestnetAuditEvent(makeInput({ eventType: "route_request_received" }));

      const counts = countTestnetAuditEventsByType();
      expect(counts.route_skeleton_blocked).toBe(2);
      expect(counts.route_request_received).toBe(1);
      expect(counts.route_rate_limited).toBe(0);
    });
  });

  // ─── Source ──────────────────────────────────────────

  describe("source", () => {
    it("always returns testnet-route-skeleton", () => {
      const event = createTestnetAuditEvent(makeInput());
      expect(event.source).toBe("testnet-route-skeleton");

      const list = listTestnetAuditEvents();
      for (const e of list) {
        expect(e.source).toBe("testnet-route-skeleton");
      }
    });
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("testnetAuditStore — static analysis", () => {
  const content = readFileSync(join(__dirname, "testnetAuditStore.ts"), "utf8");

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
