import { beforeEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  generateApiKeyRecordId,
  importMasterKey,
  maskApiKey,
} from "./crypto";

/** A deterministic test master key (Base64-encoded 32 bytes). */
const TEST_MASTER_KEY_B64 = "dGVzdC1tYXN0ZXIta2V5LWZvci11bml0dHR0dHR0dHQ=";
/** A different 32-byte key used for wrong-key decryption tests. */
const WRONG_KEY_B64 = "eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg=";
let masterKey: CryptoKey;

beforeEach(async () => {
  masterKey = await importMasterKey(TEST_MASTER_KEY_B64);
});

describe("importMasterKey", () => {
  it("imports a valid 32-byte key", async () => {
    const key = await importMasterKey(TEST_MASTER_KEY_B64);
    expect(key).toBeDefined();
    expect(key.algorithm).toBeDefined();
    // @ts-expect-error - type access
    expect(key.algorithm.name).toBe("AES-GCM");
  });

  it("rejects a key that is not 32 bytes", async () => {
    const short = "dGVzdA=="; // 4 bytes
    await expect(importMasterKey(short)).rejects.toThrow("exactly 32 bytes");
  });
});

describe("encryptSecret / decryptSecret", () => {
  it("encrypts and decrypts a secret correctly", async () => {
    const secret = "my-super-secret-api-key-12345";
    const payload = await encryptSecret(secret, masterKey);

    expect(payload.iv).toBeTruthy();
    expect(payload.ciphertext).toBeTruthy();
    expect(payload.tag).toBeTruthy();
    // ciphertext should not equal the original secret
    expect(payload.ciphertext).not.toBe(secret);

    const decrypted = await decryptSecret(payload, masterKey);
    expect(decrypted).toBe(secret);
  });

  it("produces different ciphertext for the same secret (random IV)", async () => {
    const secret = "same-secret";
    const p1 = await encryptSecret(secret, masterKey);
    const p2 = await encryptSecret(secret, masterKey);
    expect(p1.iv).not.toBe(p2.iv);
    expect(p1.ciphertext).not.toBe(p2.ciphertext);
  });

  it("fails to decrypt with a different key", async () => {
    const secret = "my-secret-key";
    const payload = await encryptSecret(secret, masterKey);

    const wrongKeyB64 = "eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg=";
    const wrongKey = await importMasterKey(wrongKeyB64);
    await expect(decryptSecret(payload, wrongKey)).rejects.toThrow();
  });

  it("handles empty string", async () => {
    const payload = await encryptSecret("", masterKey);
    const decrypted = await decryptSecret(payload, masterKey);
    expect(decrypted).toBe("");
  });
});

describe("maskApiKey", () => {
  it("masks a typical 16+ char API key", () => {
    const masked = maskApiKey("aBcDeFgHiJkLmNoP");
    expect(masked).toBe("aBcD****mNoP");
    expect(masked.length).toBeLessThan("aBcDeFgHiJkLmNoP".length);
  });

  it("masks a shorter key with correct pattern", () => {
    const masked = maskApiKey("short123");
    expect(masked).toBe("shor****");
  });

  it("does not leak the full key", () => {
    const key = "super-secret-api-key-98765";
    const masked = maskApiKey(key);
    expect(masked).not.toContain(key.slice(4, -4));
  });
});

describe("generateApiKeyRecordId", () => {
  it("generates an id with the correct prefix", () => {
    const id = generateApiKeyRecordId("binance");
    expect(id).toMatch(/^apikey-binance-/);
  });

  it("produces unique ids for different exchanges", () => {
    const id1 = generateApiKeyRecordId("binance");
    const id2 = generateApiKeyRecordId("okx");
    expect(id1).not.toBe(id2);
  });
});
