/**
 * API Key Security Tests — Beta Phase 1
 *
 * Acceptance criteria:
 *   exchange=binance, name=binance-readonly-main,
 *   apiKey=abcdef1234567890, secret=super-secret,
 *   permissions: read=true, trade=false, withdraw=false
 *   → createExchangeApiKey succeeds
 *   → isReadOnly=true, tradingEnabled=false, withdrawEnabled=false
 *   → encryptedSecret exists and !== "super-secret"
 *   → toSafeApiKeyView: maskedApiKey="abcd********7890"
 *   → no secret or encryptedSecret in SafeApiKeyView
 */

import { describe, expect, it } from "vitest";
import {
  assertReadOnlyPermissions,
  createExchangeApiKey,
  disableApiKey,
  toSafeApiKeyView,
  validateApiKeyPermissions,
} from "./apiKeySecurity";
import type { CreateApiKeyInput, ExchangeApiKey } from "./apiKeyTypes";

const MASTER_KEY = "master-key-for-testing-purposes-only-999";

function sampleInput(overrides?: Partial<CreateApiKeyInput>): CreateApiKeyInput {
  return {
    exchange: "binance",
    name: "binance-readonly-main",
    apiKey: "abcdef1234567890",
    secret: "super-secret",
    permissions: { read: true, trade: false, withdraw: false },
    ...overrides,
  };
}

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  const input = sampleInput();
  const key = createExchangeApiKey(input, MASTER_KEY);

  it("createExchangeApiKey succeeds", () => {
    expect(key).toBeDefined();
    expect(key.id).toMatch(/^key-\d{6}$/);
  });

  it("isReadOnly = true", () => {
    expect(key.isReadOnly).toBe(true);
  });

  it("tradingEnabled = false", () => {
    expect(key.tradingEnabled).toBe(false);
  });

  it("withdrawEnabled = false", () => {
    expect(key.withdrawEnabled).toBe(false);
  });

  it("encryptedSecret exists and is not the plaintext secret", () => {
    expect(key.encryptedSecret).toBeDefined();
    expect(key.encryptedSecret.iv).toBeTruthy();
    expect(key.encryptedSecret.authTag).toBeTruthy();
    expect(key.encryptedSecret.encrypted).toBeTruthy();
    expect(key.encryptedSecret.encrypted).not.toBe("super-secret");
  });

  it("toSafeApiKeyView produces correct maskedApiKey", () => {
    const safe = toSafeApiKeyView(key);
    expect(safe.maskedApiKey).toBe("abcd********7890");
  });

  it("SafeApiKeyView does not contain secret or encryptedSecret", () => {
    const safe = toSafeApiKeyView(key);
    expect((safe as Record<string, unknown>).secret).toBeUndefined();
    expect((safe as Record<string, unknown>).encryptedSecret).toBeUndefined();
  });
});

// ─── validateApiKeyPermissions ─────────────────────────

describe("validateApiKeyPermissions", () => {
  it("read=true, trade=false, withdraw=false → valid", () => {
    const result = validateApiKeyPermissions({ read: true, trade: false, withdraw: false });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("trade=true → invalid", () => {
    const result = validateApiKeyPermissions({ read: true, trade: true, withdraw: false });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Trade"))).toBe(true);
  });

  it("withdraw=true → invalid", () => {
    const result = validateApiKeyPermissions({ read: true, trade: false, withdraw: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Fund transfer"))).toBe(true);
  });

  it("trade+withdraw both true → invalid", () => {
    const result = validateApiKeyPermissions({ read: true, trade: true, withdraw: true });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("read=false → invalid", () => {
    const result = validateApiKeyPermissions({ read: false, trade: false, withdraw: false });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Read"))).toBe(true);
  });
});

// ─── assertReadOnlyPermissions ─────────────────────────

describe("assertReadOnlyPermissions", () => {
  it("throws when trade=true", () => {
    expect(() =>
      assertReadOnlyPermissions({ read: true, trade: true, withdraw: false }),
    ).toThrow("Read-only permission check failed");
  });

  it("throws when withdraw=true", () => {
    expect(() =>
      assertReadOnlyPermissions({ read: true, trade: false, withdraw: true }),
    ).toThrow("Read-only permission check failed");
  });

  it("does not throw for valid read-only", () => {
    expect(() =>
      assertReadOnlyPermissions({ read: true, trade: false, withdraw: false }),
    ).not.toThrow();
  });
});

// ─── createExchangeApiKey — rejection ───────────────────

describe("createExchangeApiKey — rejection", () => {
  it("rejects when trade=true", () => {
    expect(() =>
      createExchangeApiKey(sampleInput({ permissions: { read: true, trade: true, withdraw: false } }), MASTER_KEY),
    ).toThrow("Read-only permission check failed");
  });

  it("rejects when withdraw=true", () => {
    expect(() =>
      createExchangeApiKey(sampleInput({ permissions: { read: true, trade: false, withdraw: true } }), MASTER_KEY),
    ).toThrow("Read-only permission check failed");
  });

  it("throws when masterKey is empty", () => {
    expect(() => createExchangeApiKey(sampleInput(), "")).toThrow("Master key is required");
  });
});

// ─── disableApiKey ────────────────────────────────────

describe("disableApiKey", () => {
  it("sets status to disabled and updates updatedAt", () => {
    const key = createExchangeApiKey(sampleInput(), MASTER_KEY);
    const disabled = disableApiKey(key);
    expect(disabled.status).toBe("disabled");
    expect(disabled.updatedAt).toBeGreaterThanOrEqual(key.updatedAt);
  });
});

// ─── Immutability ─────────────────────────────────────

describe("immutability", () => {
  it("createExchangeApiKey does not mutate input", () => {
    const input = sampleInput();
    const originalSecret = input.secret;
    createExchangeApiKey(input, MASTER_KEY);
    expect(input.secret).toBe(originalSecret);
  });

  it("disableApiKey does not mutate original key", () => {
    const key = createExchangeApiKey(sampleInput(), MASTER_KEY);
    const originalStatus = key.status;
    disableApiKey(key);
    expect(key.status).toBe(originalStatus);
  });
});
