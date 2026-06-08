export type ExchangeId = "binance" | "okx" | "bybit";

export type ApiKeyPermission = "read" | "trade" | "withdraw";

export type ApiKeyStatus =
  | "not_configured"
  | "encrypted"
  | "verification_pending"
  | "verified"
  | "rejected";

export type WarningFlag = "withdraw_enabled" | "trade_enabled" | "no_ip_whitelist" | "unknown_permissions";

export type EncryptedSecretPayload = {
  /** Base64-encoded IV (12 bytes for GCM). */
  iv: string;
  /** Base64-encoded ciphertext. */
  ciphertext: string;
  /** Base64-encoded auth tag (16 bytes for GCM). */
  tag: string;
};

export type ApiKeyRecord = {
  id: string;
  exchangeId: ExchangeId;
  /** User-friendly label, e.g. "Main account" or "Sub account #2". */
  label: string;
  /** Masked API key for display, e.g. "aBcD****WxYz". */
  apiKeyMasked: string;
  /** Encrypted secret payload.  Null only when status is "not_configured". */
  encryptedSecret: EncryptedSecretPayload | null;
  /** Detected permissions after verification. */
  permissions: ApiKeyPermission[];
  status: ApiKeyStatus;
  createdAt: number;
  updatedAt: number;
  lastVerifiedAt: number | null;
  warningFlags: WarningFlag[];
};

export type CreateApiKeyInput = {
  exchangeId: ExchangeId;
  label: string;
  apiKey: string;
  secret: string;
};

// ─── Permission Verification ────────────────────────────

export type PermissionVerificationStatus = "passed" | "warning" | "rejected";

export type PermissionWarningFlag =
  | "missing-read"
  | "trade-enabled"
  | "withdraw-enabled"
  | "ip-whitelist-missing"
  | "unknown-permissions"
  | "mock-verification-only";

export type PermissionVerificationInput = {
  /** Detected or mock permissions for the API key. */
  permissions: ApiKeyPermission[];
  /** Whether an IP whitelist is configured on the exchange. */
  hasIpWhitelist?: boolean;
};

export type PermissionVerificationResult = {
  status: PermissionVerificationStatus;
  /** Human-readable label. */
  label: string;
  /** Detailed warning flags. */
  warningFlags: PermissionWarningFlag[];
  /** Human-readable messages for each flag. */
  messages: string[];
  /** Whether the key is safe for read-only use. */
  safeForReadOnly: boolean;
  /** Always true for Phase 3.3 — this is a mock verifier. */
  isMock: true;
};
