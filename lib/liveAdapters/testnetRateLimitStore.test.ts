/**
 * Testnet Rate Limit Store Skeleton Tests — Phase 5.13
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import {
  getDefaultRateLimitPolicies,
  buildRateLimitKey,
  checkRateLimit,
  incrementRateLimit,
  resetRateLimit,
  listRateLimitRecords,
  clearRateLimitRecords,
  resetRateLimitStore,
} from "./testnetRateLimitStore";
import type { TestnetRateLimitInput } from "./testnetRateLimitTypes";

const BASE_INPUT: TestnetRateLimitInput = {
  scope: "exchange",
  routeName: "orders-preview-submit",
  exchangeId: "binance",
};

describe("testnetRateLimitStore", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  // ─── Default Policies ────────────────────────────────

  describe("getDefaultRateLimitPolicies", () => {
    it("returns 3 policies (exchange, route, session)", () => {
      const policies = getDefaultRateLimitPolicies();
      expect(policies.length).toBe(3);
      const scopes = policies.map((p) => p.scope);
      expect(scopes).toContain("exchange");
      expect(scopes).toContain("route");
      expect(scopes).toContain("session");
    });

    it("exchange policy: 10 req / 1s", () => {
      const p = getDefaultRateLimitPolicies().find((p) => p.scope === "exchange")!;
      expect(p.maxRequests).toBe(10);
      expect(p.windowSeconds).toBe(1);
    });

    it("route policy: 30 req / 60s", () => {
      const p = getDefaultRateLimitPolicies().find((p) => p.scope === "route")!;
      expect(p.maxRequests).toBe(30);
      expect(p.windowSeconds).toBe(60);
    });

    it("session policy: 60 req / 60s", () => {
      const p = getDefaultRateLimitPolicies().find((p) => p.scope === "session")!;
      expect(p.maxRequests).toBe(60);
      expect(p.windowSeconds).toBe(60);
    });
  });

  // ─── buildRateLimitKey ───────────────────────────────

  describe("buildRateLimitKey", () => {
    it("exchange key format: exchange:{id}", () => {
      const key = buildRateLimitKey("exchange", "orders-preview-submit", "binance");
      expect(key).toBe("exchange:binance");
    });

    it("route key format: route:{name}", () => {
      const key = buildRateLimitKey("route", "orders-cancel", "binance");
      expect(key).toBe("route:orders-cancel");
    });

    it("session key format: session:{id}", () => {
      const key = buildRateLimitKey("session", "account-snapshot", "binance", "sess-001");
      expect(key).toBe("session:sess-001");
    });

    it("session key defaults to unknown", () => {
      const key = buildRateLimitKey("session", "account-snapshot", "binance");
      expect(key).toBe("session:unknown");
    });
  });

  // ─── checkRateLimit ──────────────────────────────────

  describe("checkRateLimit", () => {
    it("returns allowed=true before any increments", () => {
      const result = checkRateLimit(BASE_INPUT);
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(0);
      expect(result.source).toBe("testnet-route-skeleton");
    });

    it("returns current count after increments", () => {
      incrementRateLimit(BASE_INPUT);
      incrementRateLimit(BASE_INPUT);
      const result = checkRateLimit(BASE_INPUT);
      expect(result.currentCount).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── incrementRateLimit ──────────────────────────────

  describe("incrementRateLimit", () => {
    it("increments count", () => {
      const r1 = incrementRateLimit(BASE_INPUT);
      expect(r1.currentCount).toBe(1);
      const r2 = incrementRateLimit(BASE_INPUT);
      expect(r2.currentCount).toBe(2);
    });

    it("retryAfterSeconds is 0 when under limit", () => {
      const result = incrementRateLimit(BASE_INPUT);
      expect(result.retryAfterSeconds).toBe(0);
    });

    it("blocks when over exchange limit (10 req)", () => {
      // Hit exactly 11 requests on exchange scope
      for (let i = 0; i < 11; i++) {
        incrementRateLimit(BASE_INPUT);
      }
      const result = checkRateLimit(BASE_INPUT);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  // ─── Scope Independence ──────────────────────────────

  describe("scope independence", () => {
    it("exchange and route scopes count independently", () => {
      const exchangeInput: TestnetRateLimitInput = { scope: "exchange", routeName: "orders-preview-submit", exchangeId: "binance" };
      const routeInput: TestnetRateLimitInput = { scope: "route", routeName: "orders-preview-submit", exchangeId: "binance" };

      incrementRateLimit(exchangeInput);

      const exchangeResult = checkRateLimit(exchangeInput);
      const routeResult = checkRateLimit(routeInput);

      expect(exchangeResult.currentCount).toBe(1);
      expect(routeResult.currentCount).toBe(0);
    });

    it("different route names count independently for route scope", () => {
      const route1: TestnetRateLimitInput = { scope: "route", routeName: "orders-preview-submit", exchangeId: "binance" };
      const route2: TestnetRateLimitInput = { scope: "route", routeName: "orders-cancel", exchangeId: "binance" };

      incrementRateLimit(route1);
      incrementRateLimit(route1);
      incrementRateLimit(route2);

      expect(checkRateLimit(route1).currentCount).toBe(2);
      expect(checkRateLimit(route2).currentCount).toBe(1);
    });
  });

  // ─── resetRateLimit ──────────────────────────────────

  describe("resetRateLimit", () => {
    it("resets count for the given scopeKey", () => {
      incrementRateLimit(BASE_INPUT);
      incrementRateLimit(BASE_INPUT);
      expect(checkRateLimit(BASE_INPUT).currentCount).toBe(2);

      resetRateLimit("exchange:binance");
      expect(checkRateLimit(BASE_INPUT).currentCount).toBe(0);
    });
  });

  // ─── listRateLimitRecords ────────────────────────────

  describe("listRateLimitRecords", () => {
    it("returns created records", () => {
      incrementRateLimit(BASE_INPUT);
      incrementRateLimit({ scope: "route", routeName: "orders-cancel", exchangeId: "binance" });
      const list = listRateLimitRecords();
      expect(list.length).toBe(2);
    });

    it("returns empty after clear", () => {
      incrementRateLimit(BASE_INPUT);
      clearRateLimitRecords();
      expect(listRateLimitRecords()).toEqual([]);
    });
  });

  // ─── Source ──────────────────────────────────────────

  describe("source", () => {
    it("records have source = testnet-route-skeleton", () => {
      incrementRateLimit(BASE_INPUT);
      const list = listRateLimitRecords();
      for (const record of list) {
        expect(record.source).toBe("testnet-route-skeleton");
      }
    });

    it("check result has source = testnet-route-skeleton", () => {
      const result = checkRateLimit(BASE_INPUT);
      expect(result.source).toBe("testnet-route-skeleton");
    });
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("testnetRateLimitStore — static analysis", () => {
  const content = readFileSync(join(__dirname, "testnetRateLimitStore.ts"), "utf8");

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
