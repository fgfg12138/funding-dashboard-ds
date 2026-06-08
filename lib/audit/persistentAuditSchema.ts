/**
 * Persistent Audit Schema — Phase 6.1 Design Only
 *
 * Schema constants and pure functions for the future persistent audit layer.
 * No database connection, no ORM, no fetch, no crypto.
 */

import type {
  PersistentAuditTableName,
  PersistentAuditSeverity,
  PersistentAuditSource,
  PersistentAuditRetentionPolicy,
  CreatePersistentAuditEventInput,
} from "./persistentAuditTypes";

// ─── Table Definitions ───────────────────────────────────

const TABLES: PersistentAuditTableName[] = [
  "audit_events",
  "audit_event_metadata",
  "audit_integrity_checks",
];

/**
 * Get the list of persistent audit table names.
 *
 * @returns An array of table names for schema creation.
 */
export function getPersistentAuditTables(): PersistentAuditTableName[] {
  return [...TABLES];
}

// ─── Retention Policies ──────────────────────────────────

const RETENTION_POLICIES: PersistentAuditRetentionPolicy[] = [
  { env: "local", retentionDays: 7 },
  { env: "staging", retentionDays: 30, archiveAfterDays: 30 },
  { env: "production", retentionDays: 90, archiveAfterDays: 90 },
];

/**
 * Get the retention policy for a given environment.
 *
 * @param env - The environment name.
 * @returns The matching retention policy, or the local default.
 */
export function getRetentionPolicy(env: string): PersistentAuditRetentionPolicy {
  return RETENTION_POLICIES.find((p) => p.env === env) ?? RETENTION_POLICIES[0];
}

// ─── Sensitive Field Patterns ────────────────────────────

const SENSITIVE_FIELD_PATTERNS = [
  "secret", "apisecret", "api_secret", "secretkey", "privatekey",
  "private_key", "password", "signature", "signedpayload",
];

/**
 * Sanitize audit metadata by removing sensitive fields.
 * Returns a new object with only safe keys.
 *
 * @param metadata - Raw metadata record.
 * @returns A sanitized copy with sensitive fields removed.
 */
export function sanitizePersistentAuditMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!metadata) return {};

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_FIELD_PATTERNS.some((p) => lower.includes(p))) {
      sanitized[`_${key}_redacted`] = true;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ─── Deterministic Hash Skeleton ─────────────────────────

/**
 * Build a deterministic hash string for metadata.
 * This is NOT a cryptographic hash — it's a simple deterministic
 * string hash for skeleton purposes. Future phases can upgrade to SHA-256.
 *
 * @param metadata - The metadata object to hash.
 * @returns A deterministic hash string starting with "pa-hash-".
 */
export function buildMetadataHashSkeleton(
  metadata: Record<string, unknown> | undefined,
): string {
  if (!metadata) return "pa-hash-empty";

  const sorted = Object.keys(metadata)
    .sort()
    .map((k) => `${k}:${String(metadata[k])}`)
    .join("|");

  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    const char = sorted.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `pa-hash-${Math.abs(hash).toString(16)}`;
}

// ─── Event Shape Validation ──────────────────────────────

export type ShapeValidationResult = {
  valid: boolean;
  errors: string[];
};

const VALID_SEVERITIES: PersistentAuditSeverity[] = ["info", "warning", "blocked", "error"];

const VALID_SOURCES: PersistentAuditSource[] = [
  "local",
  "testnet-route-skeleton",
  "testnet-route",
  "risk-gate",
  "permission-check",
  "secret-access",
  "order-lifecycle",
];

/**
 * Validate the shape of a CreatePersistentAuditEventInput.
 *
 * Checks:
 * - eventType is non-empty string
 * - actor is non-empty string
 * - severity is valid
 * - source is valid
 * - message is non-empty string
 *
 * @param input - The event input to validate.
 * @returns Validation result with errors.
 */
export function validatePersistentAuditEventShape(
  input: CreatePersistentAuditEventInput,
): ShapeValidationResult {
  const errors: string[] = [];

  if (!input.eventType || typeof input.eventType !== "string" || input.eventType.trim() === "") {
    errors.push("eventType is required and must be a non-empty string");
  }

  if (!input.actor || typeof input.actor !== "string" || input.actor.trim() === "") {
    errors.push("actor is required and must be a non-empty string");
  }

  if (!VALID_SEVERITIES.includes(input.severity)) {
    errors.push(`severity must be one of: ${VALID_SEVERITIES.join(", ")}`);
  }

  if (!VALID_SOURCES.includes(input.source)) {
    errors.push(`source must be one of: ${VALID_SOURCES.join(", ")}`);
  }

  if (!input.message || typeof input.message !== "string" || input.message.trim() === "") {
    errors.push("message is required and must be a non-empty string");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Build the default retention policies.
 *
 * @returns An array of retention policies.
 */
export function getDefaultRetentionPolicies(): PersistentAuditRetentionPolicy[] {
  return RETENTION_POLICIES.map((p) => ({ ...p }));
}
