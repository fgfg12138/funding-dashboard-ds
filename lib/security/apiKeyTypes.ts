/**
 * API Key Types — Beta Phase 1
 *
 * Defines data structures for securely storing and managing
 * read-only exchange API keys.
 *
 * Pure types — no logic.
 */

// ─── Exchange name (supported) ──────────────────────────

export type SupportedExchange = "binance" | "bybit" | "okx";

// ─── Permissions ────────────────────────────────────────

export type ApiKeyPermissions = {
  /** Allow reading market data / account info. */
  read: boolean;
  /** Allow trading — must be false for read-only keys. */
  trade: boolean;
  /** Allow withdrawals — must be false for read-only keys. */
  withdraw: boolean;
};

// ─── Status ─────────────────────────────────────────────

export type ApiKeyStatus = "active" | "disabled";

// ─── Stored API Key (includes encrypted secret) ────────

export type ExchangeApiKey = {
  /** Unique identifier for this key record. */
  id: string;

  /** Exchange name (lowercase). */
  exchange: SupportedExchange;

  /** Human-readable label (e.g. "binance-readonly-main"). */
  name: string;

  /** The API key string (partially maskable for display). */
  apiKey: string;

  /** AES-256-GCM encrypted secret (never stored in plaintext). */
  encryptedSecret: EncryptedPayload;

  /** Permission snapshot at creation time. */
  permissions: ApiKeyPermissions;

  /** Whether only read permission was granted. */
  isReadOnly: boolean;

  /** Whether withdraw permission is present. */
  withdrawEnabled: boolean;

  /** Whether trade permission is present. */
  tradingEnabled: boolean;

  /** Creation timestamp (ms). */
  createdAt: number;

  /** Last update timestamp (ms). */
  updatedAt: number;

  /** Last usage timestamp (ms, undefined if never used). */
  lastUsedAt?: number;

  /** Whether this key is active or has been disabled. */
  status: ApiKeyStatus;
};

// ─── Encrypted payload shape ───────────────────────────

export type EncryptedPayload = {
  /** Initialisation vector (hex). */
  iv: string;
  /** Authentication tag (hex). */
  authTag: string;
  /** Ciphertext (hex). */
  encrypted: string;
};

// ─── Create Input ──────────────────────────────────────

export type CreateApiKeyInput = {
  /** Target exchange. */
  exchange: SupportedExchange;

  /** Human-readable label. */
  name: string;

  /** Raw API key string. */
  apiKey: string;

  /** Raw API secret string. */
  secret: string;

  /** Requested permissions. */
  permissions: ApiKeyPermissions;
};

// ─── Safe View (no secret, masked key) ─────────────────

export type SafeApiKeyView = {
  id: string;
  exchange: SupportedExchange;
  name: string;
  /** API key with middle characters replaced by asterisks. */
  maskedApiKey: string;
  permissions: ApiKeyPermissions;
  isReadOnly: boolean;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  status: ApiKeyStatus;
};

// ─── Validation Result ──────────────────────────────────

export type ApiKeyValidationResult = {
  /** Whether the permissions pass security rules. */
  valid: boolean;

  /** Error messages (fatal). */
  errors: string[];

  /** Warning messages (advisory). */
  warnings: string[];
};
