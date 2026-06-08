/**
 * API Key secure store — localStorage backed.
 *
 * All secrets are encrypted with AES-256-GCM before storage.
 * Plaintext secrets never touch localStorage.  Only masked API keys
 * and encrypted payloads are persisted.
 *
 * SSR-safe: try/catch gracefully handles missing localStorage.
 */

import type { ApiKeyRecord, CreateApiKeyInput } from "./types";
import { encryptSecret, generateApiKeyRecordId, maskApiKey } from "./crypto";

const STORAGE_KEY = "api-key-records";

function readAll(): ApiKeyRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ApiKeyRecord[];
  } catch {
    return [];
  }
}

function writeAll(records: ApiKeyRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Storage full — silently fail
  }
}

/** List all stored API key records.  Secret fields are always encrypted. */
export function listApiKeyRecords(): ApiKeyRecord[] {
  return readAll();
}

/** Get a single record by id. */
export function getApiKeyRecord(id: string): ApiKeyRecord | undefined {
  return readAll().find((r) => r.id === id);
}

/**
 * Save an encrypted API key record.
 *
 * The input `apiKey` and `secret` are the **plaintext** values.
 * This function immediately:
 *  1. Masks the apiKey for display
 *  2. Encrypts the secret with the provided masterKey
 *  3. Stores only the masked key + encrypted payload
 *
 * The plaintext secret is NOT returned and NOT stored outside this function.
 */
export async function saveEncryptedApiKey(
  input: CreateApiKeyInput,
  masterKey: CryptoKey,
): Promise<ApiKeyRecord> {
  const now = Date.now();
  const id = generateApiKeyRecordId(input.exchangeId);
  const apiKeyMasked = maskApiKey(input.apiKey);
  const encryptedSecret = await encryptSecret(input.secret, masterKey);

  const record: ApiKeyRecord = {
    id,
    exchangeId: input.exchangeId,
    label: input.label,
    apiKeyMasked,
    encryptedSecret,
    permissions: [],
    status: "encrypted",
    createdAt: now,
    updatedAt: now,
    lastVerifiedAt: null,
    warningFlags: [],
  };

  const all = readAll();
  all.push(record);
  writeAll(all);
  return record;
}

/** Delete an API key record by id. */
export function deleteApiKeyRecord(id: string): boolean {
  const all = readAll();
  const next = all.filter((r) => r.id !== id);
  if (next.length === all.length) return false;
  writeAll(next);
  return true;
}

/** Remove all API key records. */
export function clearApiKeyRecords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // silently fail
  }
}
