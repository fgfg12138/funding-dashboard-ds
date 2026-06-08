/**
 * AES-256-GCM encryption/decryption utilities for API Key secrets.
 *
 * Uses the Web Crypto API (available in modern Node.js and all browsers).
 * All ciphertext is Base64-encoded for safe localStorage serialization.
 *
 * No side effects.  No console.log of secrets.  No network calls.
 */

import type { EncryptedSecretPayload, ExchangeId } from "./types";

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // bytes
const TAG_LENGTH = 128; // bits (16 bytes)

// ─── Key Import / Derivation ────────────────────────────

/**
 * Import a raw 256-bit (32-byte) master key from a Base64 string.
 * In production this should come from an environment variable, NOT
 * from user input or localStorage.
 *
 * @param masterKeyB64  Base64-encoded 32-byte key
 */
export async function importMasterKey(masterKeyB64: string): Promise<CryptoKey> {
  const raw = base64Decode(masterKeyB64);
  if (raw.byteLength !== 32) {
    throw new Error(`Master key must be exactly 32 bytes (got ${raw.byteLength})`);
  }

  return crypto.subtle.importKey(
    "raw",
    raw.buffer.slice(0) as ArrayBuffer,
    { name: ALGORITHM, length: KEY_LENGTH },
    false, // not extractable
    ["encrypt", "decrypt"],
  );
}

/**
 * Derive a 256-bit key from a passphrase using PBKDF2.
 * Useful for environments where a raw key isn't available.
 *
 * @param passphrase  Human-readable passphrase
 * @param salt  Random salt (16+ bytes recommended), Base64-encoded
 */
export async function deriveKey(passphrase: string, saltB64: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase).buffer.slice(0) as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64Decode(saltB64).buffer.slice(0) as ArrayBuffer,
      iterations: 600_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

// ─── Encrypt / Decrypt ──────────────────────────────────

/**
 * Encrypt a secret string using AES-256-GCM.
 *
 * @param secret  The plaintext secret to encrypt
 * @param masterKey  A CryptoKey with encrypt usage
 * @returns EncryptedSecretPayload (all fields Base64-encoded)
 */
export async function encryptSecret(
  secret: string,
  masterKey: CryptoKey,
): Promise<EncryptedSecretPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const enc = new TextEncoder();

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv.buffer.slice(0) as ArrayBuffer, tagLength: TAG_LENGTH },
    masterKey,
    enc.encode(secret).buffer.slice(0) as ArrayBuffer,
  );

  // The returned ArrayBuffer is ciphertext || authTag (concatenated)
  const ciphertext = new Uint8Array(encrypted, 0, encrypted.byteLength - 16);
  const tag = new Uint8Array(encrypted, encrypted.byteLength - 16, 16);

  return {
    iv: base64Encode(iv),
    ciphertext: base64Encode(ciphertext),
    tag: base64Encode(tag),
  };
}

/**
 * Decrypt an EncryptedSecretPayload back to plaintext.
 *
 * @param payload  The encrypted payload (iv + ciphertext + tag)
 * @param masterKey  A CryptoKey with decrypt usage
 * @returns  The original plaintext secret string
 */
export async function decryptSecret(
  payload: EncryptedSecretPayload,
  masterKey: CryptoKey,
): Promise<string> {
  const iv = base64Decode(payload.iv);
  const ciphertext = base64Decode(payload.ciphertext);
  const tag = base64Decode(payload.tag);

  // Recombine ciphertext || tag as GCM expects
  const combined = new Uint8Array(ciphertext.byteLength + tag.byteLength);
  combined.set(new Uint8Array(ciphertext), 0);
  combined.set(new Uint8Array(tag), ciphertext.byteLength);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: iv.buffer.slice(0) as ArrayBuffer, tagLength: TAG_LENGTH },
    masterKey,
    combined.buffer.slice(0) as ArrayBuffer,
  );

  return new TextDecoder().decode(decrypted);
}

// ─── Helpers ────────────────────────────────────────────

/**
 * Mask an API key for display: show first 4 and last 4 characters.
 * If the key is shorter than 12 chars, only show first 2 + **** + last 2.
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    const half = Math.floor(apiKey.length / 2);
    return apiKey.slice(0, half) + "****";
  }
  return apiKey.slice(0, 4) + "****" + apiKey.slice(-4);
}

/** Generate a deterministic-looking record id from an exchange id and timestamp. */
export function generateApiKeyRecordId(exchangeId: ExchangeId): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `apikey-${exchangeId}-${ts}-${rand}`;
}

// ─── Base64 Encoding / Decoding ─────────────────────────

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64Decode(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
