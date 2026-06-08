/**
 * Execution Queue Store — localStorage backed.
 *
 * Holds confirmed previews as queued items awaiting future processing.
 * No network calls, no API Key access, no order submission.
 * Queue statuses are "queued-preview-only" / "cancelled" / "expired" only.
 */

import type { ExecutionQueueItem, EnqueueInput } from "./executionQueueTypes";

const STORAGE_KEY = "execution-queue";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let idCounter = 1;

function readAll(): ExecutionQueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ExecutionQueueItem[];
  } catch {
    return [];
  }
}

function writeAll(items: ExecutionQueueItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // silently fail
  }
}

function generateId(): string {
  return `queue-${Date.now()}-${idCounter++}`;
}

/** Reset id counter for tests. */
export function resetQueueIdCounter(): void {
  idCounter = 1;
}

/**
 * Enqueue a confirmed preview.
 * @returns the new ExecutionQueueItem.
 * @throws if the confirmation is already queued.
 */
export function enqueueConfirmedPreview(input: EnqueueInput): ExecutionQueueItem {
  const all = readAll();

  // Prevent duplicate enqueue
  if (all.some((item) => item.confirmationId === input.confirmation.id)) {
    throw new Error(`确认 ${input.confirmation.id} 已在队列中`);
  }

  const now = Date.now();
  const item: ExecutionQueueItem = {
    id: generateId(),
    confirmationId: input.confirmation.id,
    previewId: input.confirmation.previewId,
    opportunityId: input.confirmation.opportunityId,
    symbol: input.confirmation.symbol,
    strategyName: input.confirmation.strategyName,
    status: "queued-preview-only",
    priority: input.priority ?? "normal",
    createdAt: now,
    updatedAt: now,
    expiresAt: now + DEFAULT_TTL_MS,
    warningFlags: input.confirmation.riskMessages,
    previewSnapshot: input.confirmation.previewSnapshot,
    confirmationSnapshot: input.confirmation,
    source: "local",
  };

  all.push(item);
  writeAll(all);
  return item;
}

/** List all queue items, newest first. */
export function listQueueItems(): ExecutionQueueItem[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

/** Filter queue items by criteria. */
export function filterQueueItems(filters: {
  status?: string;
  symbol?: string;
  priority?: string;
}): ExecutionQueueItem[] {
  let items = readAll();
  if (filters.status && filters.status !== "all") {
    items = items.filter((i) => i.status === filters.status);
  }
  if (filters.symbol && filters.symbol !== "all") {
    items = items.filter((i) => i.symbol === filters.symbol);
  }
  if (filters.priority && filters.priority !== "all") {
    items = items.filter((i) => i.priority === filters.priority);
  }
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

/** Cancel a queue item by id. Returns true if cancelled. */
export function cancelQueueItem(id: string): boolean {
  const all = readAll();
  const idx = all.findIndex((i) => i.id === id);
  if (idx === -1) return false;
  all[idx] = { ...all[idx], status: "cancelled", updatedAt: Date.now() };
  writeAll(all);
  return true;
}

/** Expire a queue item by id. Returns true if expired. */
export function expireQueueItem(id: string): boolean {
  const all = readAll();
  const idx = all.findIndex((i) => i.id === id);
  if (idx === -1) return false;
  all[idx] = { ...all[idx], status: "expired", updatedAt: Date.now() };
  writeAll(all);
  return true;
}

/** Remove all queue items. */
export function clearQueueItems(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // silently fail
  }
}
