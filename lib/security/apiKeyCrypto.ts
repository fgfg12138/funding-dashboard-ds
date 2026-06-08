/**
 * API Key Crypto — Beta Phase 1
 *
 * AES-256-GCM encryption / decryption for API secrets.
 *
 * Requirements:
 *  - Each encryption uses a random IV (never reused).
 *  - Output includes iv, authTag, and ciphertext.
 *  - Secret is never logged or stored in plaintext.
 *  - masterKey is never hard-coded.
 */

import crypto from "node:crypto";

// ─── Constants ──────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;        // 128 bits
const AUTH_TAG_LENGTH = 16;  // 128 bits
const KEY_LENGTH = 32;       // 256 bits

// ─── Types ──────────────────────────────────────────────

export type EncryptedPayload = {
  iv: string;
  authTag: string;
  encrypted: string;
};

// ─── Public API ─────────────────────────────────────────

/**
 * Derive a 256-bit key from the master key material using SHA-256.
 * This ensures any length of master key is accepted and
 * produces a valid AES-256 key.
 */
function deriveKey(masterKey: string): Buffer {
  return crypto.createHash("sha256").update(masterKey, "utf-8").digest();
}

/**
 * Encrypt a plaintext secret using AES-256-GCM.
 *
 * @param secret    - Plaintext API secret.
 * @param masterKey - Master key string (any length, will be hashed to 256 bits).
 * @returns The encrypted payload containing iv, authTag, and ciphertext (all hex).
 * @throws If secret or masterKey is empty.
 */
export function encryptSecret(secret: string, masterKey: string): EncryptedPayload {
  if (!secret) throw new Error("Secret cannot be empty");
  if (!masterKey) throw new Error("Master key cannot be empty");

  const key = deriveKey(masterKey);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(secret, "utf-8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    encrypted,
  };
}

/**
 * Decrypt an AES-256-GCM encrypted payload back to the original secret.
 *
 * @param payload   - The encrypted payload (iv, authTag, encrypted — all hex).
 * @param masterKey - The same master key used for encryption.
 * @returns The original plaintext secret.
 * @throws If decryption fails (wrong key, tampered data, etc.).
 */
export function decryptSecret(payload: EncryptedPayload, masterKey: string): string {
  if (!masterKey) throw new Error("Master key cannot be empty");

  const key = deriveKey(masterKey);
  const iv = Buffer.from(payload.iv, "hex");
  const authTag = Buffer.from(payload.authTag, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(payload.encrypted, "hex", "utf-8");
  decrypted += decipher.final("utf-8");

  return decrypted;
}

/**
 * Mask an API key for safe display.
 *
 * Shows the first 4 characters and last 4 characters,
 * replacing the middle with asterisks.
 *
 * Examples:
 *   "abcdef1234567890" → "abcd********7890"
 *   "abc" → "***" (too short to mask meaningfully)
 *
 * @param apiKey - The raw API key string.
 * @returns A masked version safe for logging / UI.
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey) return "";
  if (apiKey.length <= 8) {
    // Too short — mask entirely
    return "*".repeat(apiKey.length);
  }

  const prefix = apiKey.slice(0, 4);
  const suffix = apiKey.slice(-4);
  const masked = "*".repeat(apiKey.length - 8);

  return `${prefix}${masked}${suffix}`;
}
