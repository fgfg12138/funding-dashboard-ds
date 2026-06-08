/**
 * Sandbox Order Lifecycle Store — localStorage backed.
 *
 * Records the lifecycle of mock sandbox orders: ready → submitted → filled / cancelled / failed.
 * No network calls, no API Key access, no real order placement.
 * All records have source: "mock-sandbox".
 */

import type { SandboxOrderLifecycleRecord, CreateLifecycleInput } from "./sandboxOrderLifecycleTypes";
import type { TradingOrderResult, TradingOrderSandboxStatus } from "./tradingAdapterTypes";

const STORAGE_KEY = "sandbox-order-lifecycles";

let idCounter = 1;

function readAll(): SandboxOrderLifecycleRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SandboxOrderLifecycleRecord[];
  } catch {
    return [];
  }
}

function writeAll(records: SandboxOrderLifecycleRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // silently fail
  }
}

function generateId(): string {
  return `sandbox-lifecycle-${Date.now()}-${idCounter++}`;
}

/** Reset id counter for tests. */
export function resetLifecycleIdCounter(): void {
  idCounter = 1;
}

/**
 * Create a new sandbox order lifecycle record.
 * The record starts with currentStatus="sandbox-ready" and no results.
 */
export function createSandboxLifecycleRecord(input: CreateLifecycleInput): SandboxOrderLifecycleRecord {
  const now = Date.now();
  const record: SandboxOrderLifecycleRecord = {
    id: generateId(),
    queueItemId: input.queueItemId,
    confirmationId: input.confirmationId,
    previewId: input.previewId,
    opportunityId: input.opportunityId,
    symbol: input.symbol,
    exchangeId: input.exchangeId,
    request: input.request,
    resultHistory: [],
    currentStatus: "sandbox-ready",
    source: "mock-sandbox",
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    filledAt: null,
    cancelledAt: null,
    failedAt: null,
    warningFlags: ["mock-sandbox-only"],
  };

  const all = readAll();
  all.push(record);
  writeAll(all);
  return record;
}

/** List all lifecycle records, newest first. */
export function listSandboxLifecycleRecords(): SandboxOrderLifecycleRecord[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

/** Get a single lifecycle record by id. */
export function getSandboxLifecycleRecord(id: string): SandboxOrderLifecycleRecord | undefined {
  return readAll().find((r) => r.id === id);
}

/**
 * Append a TradingOrderResult to the lifecycle history and update currentStatus.
 */
export function appendSandboxOrderResult(recordId: string, result: TradingOrderResult): SandboxOrderLifecycleRecord | undefined {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === recordId);
  if (idx === -1) return undefined;

  const record = all[idx];
  const now = Date.now();
  const updatedRecord: SandboxOrderLifecycleRecord = {
    ...record,
    resultHistory: [...record.resultHistory, result],
    currentStatus: result.status,
    updatedAt: now,
    submittedAt: result.status === "sandbox-submitted" ? (record.submittedAt ?? now) : record.submittedAt,
    filledAt: result.status === "sandbox-filled" ? now : record.filledAt,
    cancelledAt: result.status === "sandbox-cancelled" ? now : record.cancelledAt,
    failedAt: result.status === "sandbox-failed" ? now : record.failedAt,
  };

  all[idx] = updatedRecord;
  writeAll(all);
  return updatedRecord;
}

/** Mark a lifecycle record as cancelled (convenience wrapper). */
export function markSandboxCancelled(recordId: string, reason?: string): SandboxOrderLifecycleRecord | undefined {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === recordId);
  if (idx === -1) return undefined;

  const record = all[idx];
  const now = Date.now();
  const fakeResult: TradingOrderResult = {
    exchangeId: record.exchangeId,
    orderId: `mock-${record.exchangeId}-cancel-${now}`,
    clientOrderId: record.request.clientOrderId,
    symbol: record.symbol,
    side: record.request.side,
    orderType: record.request.orderType,
    price: record.request.price ?? 0,
    quantity: record.request.quantity,
    filledQuantity: 0,
    status: "sandbox-cancelled",
    source: "mock-sandbox",
    submittedAt: record.submittedAt ?? now,
    errorMessage: reason,
  };

  const updatedRecord: SandboxOrderLifecycleRecord = {
    ...record,
    resultHistory: [...record.resultHistory, fakeResult],
    currentStatus: "sandbox-cancelled",
    updatedAt: now,
    cancelledAt: now,
  };

  all[idx] = updatedRecord;
  writeAll(all);
  return updatedRecord;
}

/** Mark a lifecycle record as failed (convenience wrapper). */
export function markSandboxFailed(recordId: string, reason: string): SandboxOrderLifecycleRecord | undefined {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === recordId);
  if (idx === -1) return undefined;

  const record = all[idx];
  const now = Date.now();
  const fakeResult: TradingOrderResult = {
    exchangeId: record.exchangeId,
    orderId: `mock-${record.exchangeId}-failed-${now}`,
    clientOrderId: record.request.clientOrderId,
    symbol: record.symbol,
    side: record.request.side,
    orderType: record.request.orderType,
    price: record.request.price ?? 0,
    quantity: record.request.quantity,
    filledQuantity: 0,
    status: "sandbox-failed",
    source: "mock-sandbox",
    submittedAt: record.submittedAt ?? now,
    errorMessage: reason,
  };

  const updatedRecord: SandboxOrderLifecycleRecord = {
    ...record,
    resultHistory: [...record.resultHistory, fakeResult],
    currentStatus: "sandbox-failed",
    updatedAt: now,
    failedAt: now,
  };

  all[idx] = updatedRecord;
  writeAll(all);
  return updatedRecord;
}

/** Remove all lifecycle records. */
export function clearSandboxLifecycleRecords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // silently fail
  }
}
