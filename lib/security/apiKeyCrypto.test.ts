/**
 * API Key Crypto Tests — Beta Phase 1
 */

import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskApiKey } from "./apiKeyCrypto";

const MASTER_KEY = "this-is-a-test-master-key-for-unit-tests-12345";

// ─── encryptSecret + decryptSecret ─────────────────────

describe("encryptSecret / decryptSecret", () => {
  it("encryptSecret output differs from plaintext", () => {
    const result = encryptSecret("super-secret", MASTER_KEY);
    expect(result.encrypted).not.toBe("super-secret");
  });

  it("decryptSecret can restore the original secret", () => {
    const original = "super-secret";
    const encrypted = encryptSecret(original, MASTER_KEY);
    const decrypted = decryptSecret(encrypted, MASTER_KEY);
    expect(decrypted).toBe(original);
  });

  it("same secret produces different ciphertext each time (random IV)", () => {
    const secret = "my-api-secret";
    const r1 = encryptSecret(secret, MASTER_KEY);
    const r2 = encryptSecret(secret, MASTER_KEY);
    expect(r1.iv).not.toBe(r2.iv);
    expect(r1.encrypted).not.toBe(r2.encrypted);
    expect(r1.authTag).not.toBe(r2.authTag);
  });

  it("wrong master key cannot decrypt", () => {
    const original = "super-secret";
    const encrypted = encryptSecret(original, MASTER_KEY);
    expect(() => decryptSecret(encrypted, "wrong-key")).toThrow();
  });

  it("throws when secret is empty", () => {
    expect(() => encryptSecret("", MASTER_KEY)).toThrow("Secret cannot be empty");
  });

  it("throws when master key is empty", () => {
    expect(() => encryptSecret("secret", "")).toThrow("Master key cannot be empty");
    const payload = encryptSecret("secret", MASTER_KEY);
    expect(() => decryptSecret(payload, "")).toThrow("Master key cannot be empty");
  });
});

// ─── maskApiKey ─────────────────────────────────────────

describe("maskApiKey", () => {
  it("masks middle of a 16-character key", () => {
    expect(maskApiKey("abcdef1234567890")).toBe("abcd********7890");
  });

  it("masks entire key when 8 characters or fewer", () => {
    expect(maskApiKey("abcd1234")).toBe("********");
  });

  it("masks entirely for very short keys", () => {
    expect(maskApiKey("abc")).toBe("***");
  });

  it("returns empty string for empty input", () => {
    expect(maskApiKey("")).toBe("");
  });
});
