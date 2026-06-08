/**
 * API Key Security — Beta Phase 1
 *
 * Validation, creation, safe-view, and lifecycle management
 * for read-only exchange API keys.
 *
 * Pure functions — no side effects, no storage, no network.
 * Crypto operations delegate to apiKeyCrypto.ts.
 */

import { encryptSecret, maskApiKey } from "./apiKeyCrypto";
import type {
  ApiKeyPermissions,
  ApiKeyValidationResult,
  CreateApiKeyInput,
  ExchangeApiKey,
  SafeApiKeyView,
  SupportedExchange,
} from "./apiKeyTypes";

// ─── ID generator (simple counter for in-memory use) ─────

let _nextId = 1;

function generateId(): string {
  return `key-${String(_nextId++).padStart(6, "0")}`;
}

// ─── Public API ──────────────────────────────────────────

/**
 * Validate API key permissions against read-only security policy.
 *
 * Rules:
 *  - read must be true
 *  - trade must be false (read-only only)
 *  - withdraw must be false (read-only only)
 *
 * @param permissions - The permissions to validate.
 * @returns ApiKeyValidationResult with errors / warnings.
 */
export function validateApiKeyPermissions(permissions: ApiKeyPermissions): ApiKeyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!permissions.read) {
    errors.push("Read permission is required.");
  }

  if (permissions.trade) {
    errors.push("Trade permission is not allowed for read-only keys.");
  }

  if (permissions.withdraw) {
    errors.push("Fund transfer permission is not allowed for read-only keys.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Assert that permissions are strictly read-only.
 *
 * Throws if trade or withdraw is enabled, or if read is disabled.
 *
 * @param permissions - The permissions to check.
 * @throws Error with a descriptive message if validation fails.
 */
export function assertReadOnlyPermissions(permissions: ApiKeyPermissions): void {
  const result = validateApiKeyPermissions(permissions);
  if (!result.valid) {
    throw new Error(`Read-only permission check failed: ${result.errors.join("; ")}`);
  }
}

/**
 * Create a new ExchangeApiKey from user input.
 *
 * - Validates that permissions are read-only (throws otherwise).
 * - Encrypts the secret using AES-256-GCM.
 * - Stores masked / boolean convenience fields.
 *
 * @param input     - The API key creation input.
 * @param masterKey - Master key for encrypting the secret.
 * @returns A fully populated ExchangeApiKey.
 * @throws If permissions violate read-only policy, or masterKey is empty.
 */
export function createExchangeApiKey(
  input: CreateApiKeyInput,
  masterKey: string,
): ExchangeApiKey {
  if (!masterKey) {
    throw new Error("Master key is required for API key creation.");
  }

  // Validate permissions (throws if not read-only)
  assertReadOnlyPermissions(input.permissions);

  // Encrypt the secret
  const encryptedPayload = encryptSecret(input.secret, masterKey);

  const now = Date.now();

  return {
    id: generateId(),
    exchange: input.exchange,
    name: input.name,
    apiKey: input.apiKey,
    encryptedSecret: encryptedPayload,
    permissions: { ...input.permissions },
    isReadOnly: true,
    withdrawEnabled: input.permissions.withdraw,
    tradingEnabled: input.permissions.trade,
    createdAt: now,
    updatedAt: now,
    status: "active",
  };
}

/**
 * Convert a stored ExchangeApiKey to a safe public view.
 *
 * - Removes encryptedSecret entirely.
 * - Masks the apiKey for display.
 *
 * @param apiKey - The stored key (must contain apiKey and metadata).
 * @returns A SafeApiKeyView safe for external display.
 */
export function toSafeApiKeyView(apiKey: ExchangeApiKey): SafeApiKeyView {
  return {
    id: apiKey.id,
    exchange: apiKey.exchange,
    name: apiKey.name,
    maskedApiKey: maskApiKey(apiKey.apiKey),
    permissions: { ...apiKey.permissions },
    isReadOnly: apiKey.isReadOnly,
    createdAt: apiKey.createdAt,
    updatedAt: apiKey.updatedAt,
    lastUsedAt: apiKey.lastUsedAt,
    status: apiKey.status,
  };
}

/**
 * Disable an API key by setting its status to "disabled".
 *
 * @param apiKey - The key to disable.
 * @returns A new ExchangeApiKey with updated status and updatedAt.
 */
export function disableApiKey(apiKey: ExchangeApiKey): ExchangeApiKey {
  return {
    ...apiKey,
    status: "disabled",
    updatedAt: Date.now(),
  };
}
