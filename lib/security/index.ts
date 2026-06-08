/**
 * Security — Barrel export
 *
 * Re-exports all Beta-1 API Key Security types and functions.
 */

// Types
export type {
  ApiKeyPermissions,
  ApiKeyStatus,
  ApiKeyValidationResult,
  CreateApiKeyInput,
  EncryptedPayload,
  ExchangeApiKey,
  SafeApiKeyView,
  SupportedExchange,
} from "./apiKeyTypes";

// Crypto
export { decryptSecret, encryptSecret, maskApiKey } from "./apiKeyCrypto";

// Security
export {
  assertReadOnlyPermissions,
  createExchangeApiKey,
  disableApiKey,
  toSafeApiKeyView,
  validateApiKeyPermissions,
} from "./apiKeySecurity";
