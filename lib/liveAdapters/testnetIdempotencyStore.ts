/**
 * Testnet Idempotency Store Skeleton — Phase 5.12
 *
 * In-memory store for idempotency records. SSR-safe (checks typeof window).
 * No secrets stored. No network calls. No real dedup enforcement.
 *
 * All records are created with status "recorded-blocked" because
 * Phase 5.12 routes only return 403.
 */

import type {
  TestnetIdempotencyRecord,
  TestnetIdempotencyRecordStatus,
  TestnetIdempotencyInput,
  TestnetIdempotencyCreateResult,
} from "./testnetIdempotencyTypes";
import type { TestnetRouteName } from "./testnetRouteTypes";

// ─── In-Memory Store ─────────────────────────────────────

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Simple deterministic string hash (not crypto, not HMAC).
 * Used only for request dedup comparison — no secrets involved.
 */
export function buildRequestHash(fields: Record<string, unknown>): string {
  const sorted = Object.keys(fields)
    .sort()
    .map((k) => `${k}:${String(fields[k])}`)
    .join("|");
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    const char = sorted.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `sk-hash-${Math.abs(hash).toString(16)}`;
}

let _records: TestnetIdempotencyRecord[] = [];
let _idCounter = 0;

/** Reset the store (for testing). */
export function resetIdempotencyStore(): void {
  _records = [];
  _idCounter = 0;
}

// ─── Store Methods ───────────────────────────────────────

/**
 * Create a new idempotency record.
 * If a non-expired record with the same idempotencyKey + routeName exists,
 * returns it as a duplicate without creating a new record.
 *
 * @param input - The idempotency input including key, route, request fields.
 * @returns The created or existing record with isDuplicate flag.
 */
export function createIdempotencyRecord(input: TestnetIdempotencyInput): TestnetIdempotencyCreateResult {
  const now = Date.now();

  // Check for existing non-expired record
  const existing = _records.find(
    (r) =>
      r.idempotencyKey === input.idempotencyKey &&
      r.routeName === input.routeName &&
      r.expiresAt > now &&
      r.status !== "expired",
  );

  if (existing) {
    // Mark the existing record as duplicate-blocked
    existing.status = "duplicate-blocked";
    existing.updatedAt = now;
    return { record: { ...existing }, isDuplicate: true };
  }

  const record = createBlockedRecord(input);
  _records.push(record);
  return { record, isDuplicate: false };
}

function createBlockedRecord(input: TestnetIdempotencyInput): TestnetIdempotencyRecord {
  const now = Date.now();
  const id = `idem-${++_idCounter}-${now}`;
  return {
    id,
    idempotencyKey: input.idempotencyKey,
    clientOrderId: input.clientOrderId,
    routeName: input.routeName,
    exchangeId: input.exchangeId,
    requestHash: buildRequestHash(input.requestFields),
    responseSnapshot: input.responseSnapshot,
    status: "recorded-blocked",
    createdAt: now,
    updatedAt: now,
    expiresAt: now + DEFAULT_TTL_MS,
    source: "testnet-route-skeleton",
  };
}

/**
 * Find an idempotency record by key + route name.
 *
 * @param idempotencyKey - The idempotency key to look up.
 * @param routeName - The route name to scope the lookup.
 * @returns The matching record, or undefined.
 */
export function findIdempotencyRecord(
  idempotencyKey: string,
  routeName: TestnetRouteName,
): TestnetIdempotencyRecord | undefined {
  const now = Date.now();
  return _records.find(
    (r) => r.idempotencyKey === idempotencyKey && r.routeName === routeName && r.expiresAt > now && r.status !== "expired",
  );
}

/**
 * Mark an idempotency record as duplicate-blocked.
 *
 * @param id - The record ID.
 */
export function markDuplicateBlocked(id: string): void {
  const record = _records.find((r) => r.id === id);
  if (record) {
    record.status = "duplicate-blocked";
    record.updatedAt = Date.now();
  }
}

/**
 * Mark an idempotency record as expired.
 *
 * @param id - The record ID.
 */
export function expireIdempotencyRecord(id: string): void {
  const record = _records.find((r) => r.id === id);
  if (record) {
    record.status = "expired";
    record.updatedAt = Date.now();
  }
}

/**
 * List all idempotency records, newest first.
 *
 * @returns A shallow copy of the records array.
 */
export function listIdempotencyRecords(): TestnetIdempotencyRecord[] {
  return [..._records].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Clear all idempotency records from the store.
 */
export function clearIdempotencyRecords(): void {
  _records = [];
}
