/**
 * Phase 5.23 Testnet Route Runtime Smoke Tests
 *
 * Verifies that /api/testnet/* route handlers return 403 blocked
 * at runtime with all preflight fields present in the response body.
 *
 * No real testnet requests, no secret, no signing.
 */

import { describe, expect, it, beforeEach } from "vitest";

// ─── Helpers ─────────────────────────────────────────────

const PREFLIGHT_FIELDS = [
  "success",
  "error",
  "env",
  "guard",
  "secretPolicy",
  "permission",
  "validation",
  "idempotency",
  "rateLimit",
  "audit",
];

function assertBlockedResponseShape(body: Record<string, unknown>) {
  expect(body.success).toBe(false);
  expect(body.error).toBeDefined();
  expect(typeof (body.error as Record<string, unknown>).message).toBe("string");
  expect((body.error as Record<string, unknown>).message).toContain("no network request, no order placement");

  for (const field of PREFLIGHT_FIELDS) {
    expect(body[field], `response body missing field: ${field}`).toBeDefined();
  }
}

function setTestEnv(overrides?: Record<string, string>) {
  process.env = {
    ...process.env,
    EXCHANGE_ENV: "disabled",
    LIVE_TRADING_ENABLED: "false",
    ALLOW_MAINNET_TRADING: "false",
    TESTNET_ROUTES_ENABLED: "false",
    TESTNET_ORDER_SUBMIT_ENABLED: "false",
    ...overrides,
  };
}

beforeEach(() => {
  setTestEnv();
});

// ─── POST /api/testnet/orders/preview-submit ────────────

describe("POST /api/testnet/orders/preview-submit — runtime smoke", () => {
  it("returns 403 with all preflight fields (default env)", async () => {
    setTestEnv();
    const { POST } = await import("../app/api/testnet/orders/preview-submit/route");
    const response = await POST();
    const body = await response.json();
    expect(response.status).toBe(403);
    assertBlockedResponseShape(body);
  });

  it("returns 403 even with EXCHANGE_ENV=testnet + TESTNET_ROUTES_ENABLED=true", async () => {
    setTestEnv({ EXCHANGE_ENV: "testnet", TESTNET_ROUTES_ENABLED: "true" });
    const { POST } = await import("../app/api/testnet/orders/preview-submit/route");
    const response = await POST();
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.env).toBeDefined();
  });

  it("returns 403 even with TESTNET_ORDER_SUBMIT_ENABLED=true", async () => {
    setTestEnv({ TESTNET_ORDER_SUBMIT_ENABLED: "true" });
    const { POST } = await import("../app/api/testnet/orders/preview-submit/route");
    const response = await POST();
    const jsonBody = await response.json();
    expect(response.status).toBe(403);
    expect(jsonBody.success).toBe(false);
  });

  it("returns 403 even with ALLOW_MAINNET_TRADING=true", async () => {
    setTestEnv({ ALLOW_MAINNET_TRADING: "true" });
    const { POST } = await import("../app/api/testnet/orders/preview-submit/route");
    const response = await POST();
    const jsonBody = await response.json();
    expect(response.status).toBe(403);
    expect(jsonBody.success).toBe(false);
  });
});

// ─── POST /api/testnet/orders/cancel ────────────────────

describe("POST /api/testnet/orders/cancel — runtime smoke", () => {
  it("returns 403 with all preflight fields", async () => {
    const { POST } = await import("../app/api/testnet/orders/cancel/route");
    const response = await POST();
    const body = await response.json();
    expect(response.status).toBe(403);
    assertBlockedResponseShape(body);
  });
});

// ─── GET /api/testnet/orders/[id] ────────────────────────

describe("GET /api/testnet/orders/[id] — runtime smoke", () => {
  it("returns 403 with all preflight fields", async () => {
    const { GET } = await import("../app/api/testnet/orders/[id]/route");
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(403);
    assertBlockedResponseShape(body);
  });
});

// ─── GET /api/testnet/account/snapshot ───────────────────

describe("GET /api/testnet/account/snapshot — runtime smoke", () => {
  it("returns 403 with all preflight fields", async () => {
    const { GET } = await import("../app/api/testnet/account/snapshot/route");
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(403);
    assertBlockedResponseShape(body);
  });
});
