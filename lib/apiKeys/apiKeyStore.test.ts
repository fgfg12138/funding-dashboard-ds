import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./crypto", () => ({
  encryptSecret: vi.fn(() => Promise.resolve({
    iv: "mock-iv", ciphertext: "mock-ciphertext-data", tag: "mock-tag",
  })),
  maskApiKey: vi.fn((key: string) => {
    if (key.length <= 8) return key.slice(0, 4) + "****";
    return key.slice(0, 4) + "****" + key.slice(-4);
  }),
  generateApiKeyRecordId: vi.fn((exchangeId: string) => `apikey-${exchangeId}-test-id`),
}));

import { clearApiKeyRecords, deleteApiKeyRecord, getApiKeyRecord, listApiKeyRecords, saveEncryptedApiKey } from "./apiKeyStore";

const mockMasterKey = { algorithm: { name: "AES-GCM", length: 256 } } as any;

function createMockStorage() {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((key) => delete store[key]); },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createMockStorage());
});

describe("apiKeyStore", () => {
  it("returns empty list initially", () => {
    expect(listApiKeyRecords()).toEqual([]);
  });

  it("saves and retrieves a record with encrypted secret", async () => {
    const record = await saveEncryptedApiKey(
      { exchangeId: "binance", label: "My Key", apiKey: "aBcDeFgHiJkLmNoP", secret: "super-secret-12345" },
      mockMasterKey,
    );

    expect(record.id).toBe("apikey-binance-test-id");
    expect(record.encryptedSecret).not.toBeNull();
    expect(record.encryptedSecret!.ciphertext).toBe("mock-ciphertext-data");
    expect(record.status).toBe("encrypted");

    const all = listApiKeyRecords();
    expect(all).toHaveLength(1);
    expect(all[0].apiKeyMasked).toBe(record.apiKeyMasked);
  });

  it("lists multiple records", async () => {
    await saveEncryptedApiKey({ exchangeId: "binance", label: "K1", apiKey: "key1", secret: "s1" }, mockMasterKey);
    await saveEncryptedApiKey({ exchangeId: "okx", label: "K2", apiKey: "key2", secret: "s2" }, mockMasterKey);

    expect(listApiKeyRecords()).toHaveLength(2);
  });

  it("gets a record by id", async () => {
    const record = await saveEncryptedApiKey({ exchangeId: "bybit", label: "Test", apiKey: "test-key-1234", secret: "secret" }, mockMasterKey);
    const found = getApiKeyRecord(record.id);
    expect(found).toBeDefined();
    expect(found!.exchangeId).toBe("bybit");
  });

  it("deletes a record by id", async () => {
    const r1 = await saveEncryptedApiKey({ exchangeId: "binance", label: "K1", apiKey: "k1", secret: "s1" }, mockMasterKey);
    await saveEncryptedApiKey({ exchangeId: "okx", label: "K2", apiKey: "k2", secret: "s2" }, mockMasterKey);

    const deleted = deleteApiKeyRecord(r1.id);
    expect(deleted).toBe(true);
    expect(listApiKeyRecords()).toHaveLength(1);
    expect(listApiKeyRecords()[0].exchangeId).toBe("okx");
  });

  it("returns false when deleting non-existent id", () => {
    expect(deleteApiKeyRecord("non-existent")).toBe(false);
  });

  it("clears all records", async () => {
    await saveEncryptedApiKey({ exchangeId: "binance", label: "K1", apiKey: "k1", secret: "s1" }, mockMasterKey);
    await saveEncryptedApiKey({ exchangeId: "okx", label: "K2", apiKey: "k2", secret: "s2" }, mockMasterKey);

    clearApiKeyRecords();
    expect(listApiKeyRecords()).toEqual([]);
  });
});
