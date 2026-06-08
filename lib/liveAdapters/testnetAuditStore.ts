/**
 * Testnet Audit Server Event Store Skeleton — Phase 5.14
 *
 * In-memory store for testnet route audit events.
 * SSR-safe. No secrets stored. No network calls.
 */

import type {
  TestnetAuditEvent,
  TestnetAuditEventInput,
  TestnetAuditEventFilters,
  TestnetAuditEventCountByType,
  TestnetAuditEventType,
} from "./testnetAuditTypes";

// ─── In-Memory Store ─────────────────────────────────────

let _events: TestnetAuditEvent[] = [];
let _idCounter = 0;

/** Reset the store (for testing). */
export function resetAuditStore(): void {
  _events = [];
  _idCounter = 0;
}

// ─── Helpers ─────────────────────────────────────────────

/**
 * Build a deterministic-ish request ID with route name prefix.
 *
 * @param routeName - The testnet route name.
 * @param exchangeId - The exchange ID.
 * @returns A string like "sk-audit-orders-preview-submit-binance-123456"
 */
export function buildTestnetRequestId(routeName: string, exchangeId: string): string {
  const ts = Date.now();
  const seq = ++_idCounter;
  return `sk-audit-${routeName}-${exchangeId}-${ts}-${seq}`;
}

// ─── Store Methods ───────────────────────────────────────

/**
 * Create a testnet audit event.
 *
 * @param input - Audit event input (no id/timestamp, those are generated).
 * @returns The created audit event.
 */
export function createTestnetAuditEvent(input: TestnetAuditEventInput): TestnetAuditEvent {
  const now = Date.now();
  const id = `audit-${++_idCounter}-${now}`;

  const event: TestnetAuditEvent = {
    id,
    eventType: input.eventType,
    routeName: input.routeName,
    method: input.method,
    exchangeId: input.exchangeId,
    requestId: input.requestId,
    idempotencyKey: input.idempotencyKey,
    clientOrderId: input.clientOrderId,
    severity: input.severity,
    errorCode: input.errorCode,
    message: input.message,
    metadata: input.metadata ?? {},
    createdAt: now,
    source: "testnet-route-skeleton",
  };

  _events.push(event);
  return event;
}

/**
 * List all audit events, newest first.
 *
 * @returns A shallow copy of events.
 */
export function listTestnetAuditEvents(): TestnetAuditEvent[] {
  return [..._events].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Filter audit events by route name, event type, severity, etc.
 *
 * @param filters - Filter criteria (all optional).
 * @returns Filtered events, newest first.
 */
export function filterTestnetAuditEvents(filters: TestnetAuditEventFilters): TestnetAuditEvent[] {
  return [..._events].filter((e) => {
    if (filters.routeName && e.routeName !== filters.routeName) return false;
    if (filters.eventType && e.eventType !== filters.eventType) return false;
    if (filters.severity && e.severity !== filters.severity) return false;
    if (filters.exchangeId && e.exchangeId !== filters.exchangeId) return false;
    if (filters.fromTimestamp && e.createdAt < filters.fromTimestamp) return false;
    if (filters.toTimestamp && e.createdAt > filters.toTimestamp) return false;
    return true;
  }).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Count audit events grouped by event type.
 *
 * @returns A record of event type → count.
 */
export function countTestnetAuditEventsByType(): TestnetAuditEventCountByType {
  const types: TestnetAuditEventType[] = [
    "route_request_received",
    "route_request_blocked",
    "route_rate_limited",
    "route_duplicate_blocked",
    "route_skeleton_blocked",
  ];

  const counts: TestnetAuditEventCountByType = {} as TestnetAuditEventCountByType;
  for (const t of types) {
    counts[t] = 0;
  }

  for (const event of _events) {
    if (counts[event.eventType] !== undefined) {
      counts[event.eventType]++;
    }
  }

  return counts;
}

/**
 * Clear all audit events from the store.
 */
export function clearTestnetAuditEvents(): void {
  _events = [];
}
