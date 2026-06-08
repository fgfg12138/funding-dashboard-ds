/**
 * Order Confirmation Store — localStorage backed.
 *
 * Stores user confirmations for order previews.
 * No network calls, no API Key access, no order submission.
 */

import type { ConfirmationRecord, CreateConfirmationInput } from "./orderConfirmationTypes";

const STORAGE_KEY = "order-confirmations";

let idCounter = 1;

function readAll(): ConfirmationRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ConfirmationRecord[];
  } catch {
    return [];
  }
}

function writeAll(records: ConfirmationRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Storage full — silently fail
  }
}

function generateId(): string {
  return `confirm-${Date.now()}-${idCounter++}`;
}

/** Reset id counter for tests. */
export function resetConfirmationIdCounter(): void {
  idCounter = 1;
}

/**
 * Create a confirmation record from a preview + user acceptance.
 * This does NOT submit any order — it only records the user's intent.
 *
 * @returns The newly created ConfirmationRecord.
 * @throws If riskAccepted or disclaimerAccepted is false.
 */
export function createConfirmation(input: CreateConfirmationInput): ConfirmationRecord {
  if (!input.riskAccepted) {
    throw new Error("风险确认未勾选 — 必须接受风险才能确认");
  }
  if (!input.disclaimerAccepted) {
    throw new Error("免责声明未勾选 — 必须确认理解不会真实下单");
  }
  if (!input.preview.submittable) {
    throw new Error("风控未通过 — 不可确认此预览");
  }

  const now = Date.now();
  const record: ConfirmationRecord = {
    id: generateId(),
    previewId: input.preview.id,
    opportunityId: input.preview.opportunityId,
    symbol: input.preview.symbol,
    strategyName: input.preview.strategyName,
    confirmedAt: now,
    confirmedBy: "local-user",
    status: "confirmed-preview-only",
    riskAccepted: input.riskAccepted,
    riskMessages: input.preview.warnings,
    previewSnapshot: input.preview,
    disclaimerAccepted: input.disclaimerAccepted,
  };

  const all = readAll();
  all.push(record);
  writeAll(all);
  return record;
}

/** Get all confirmation records. */
export function listConfirmations(): ConfirmationRecord[] {
  return readAll();
}

/** Get a confirmation record by id. */
export function getConfirmation(id: string): ConfirmationRecord | undefined {
  return readAll().find((r) => r.id === id);
}

/** Clear all confirmation records. */
export function clearConfirmations(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // silently fail
  }
}
