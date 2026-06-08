/**
 * Audit Store — localStorage backed event log.
 *
 * Records key actions in the semi-automated trading flow:
 * previews, confirmations, risk blocks, paper executions.
 * All events are local-only, no network calls.
 */

import type { AuditEvent, AuditEventFilters, CreateAuditEventInput } from "./auditTypes";

const STORAGE_KEY = "audit-events";

let idCounter = 1;

function readAll(): AuditEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AuditEvent[];
  } catch {
    return [];
  }
}

function writeAll(events: AuditEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // silently fail
  }
}

function generateId(): string {
  return `audit-${Date.now()}-${idCounter++}`;
}

/** Reset id counter for tests. */
export function resetAuditIdCounter(): void {
  idCounter = 1;
}

/**
 * Create and append a new audit event.
 * @returns the created AuditEvent.
 */
export function createAuditEvent(input: CreateAuditEventInput): AuditEvent {
  const event: AuditEvent = {
    id: generateId(),
    eventType: input.eventType,
    actor: input.actor ?? "local-user",
    timestamp: Date.now(),
    entityType: input.entityType,
    entityId: input.entityId,
    symbol: input.symbol,
    exchangeIds: input.exchangeIds,
    strategyName: input.strategyName,
    severity: input.severity,
    message: input.message,
    metadata: input.metadata,
    source: "local",
  };

  const all = readAll();
  all.push(event);
  writeAll(all);
  return event;
}

/** Append a pre-built event (for testing). */
export function appendAuditEvent(event: AuditEvent): void {
  const all = readAll();
  all.push(event);
  writeAll(all);
}

/** List all audit events, newest first. */
export function listAuditEvents(): AuditEvent[] {
  return readAll().sort((a, b) => b.timestamp - a.timestamp);
}

/** Filter audit events by criteria. */
export function filterAuditEvents(filters: AuditEventFilters): AuditEvent[] {
  let events = readAll();

  if (filters.eventType) {
    events = events.filter((e) => e.eventType === filters.eventType);
  }
  if (filters.severity) {
    events = events.filter((e) => e.severity === filters.severity);
  }
  if (filters.symbol) {
    events = events.filter((e) => e.symbol === filters.symbol);
  }
  if (filters.actor) {
    events = events.filter((e) => e.actor === filters.actor);
  }
  if (filters.since) {
    events = events.filter((e) => e.timestamp >= filters.since!);
  }
  if (filters.until) {
    events = events.filter((e) => e.timestamp <= filters.until!);
  }

  events.sort((a, b) => b.timestamp - a.timestamp);

  if (filters.limit && filters.limit > 0) {
    events = events.slice(0, filters.limit);
  }

  return events;
}

/** Remove all audit events. */
export function clearAuditEvents(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // silently fail
  }
}
