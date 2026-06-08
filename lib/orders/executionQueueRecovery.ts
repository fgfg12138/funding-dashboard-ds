/**
 * Execution Queue Recovery / Expiration — pure function module.
 *
 * Detects expired items, calculates queue health, and marks items as expired.
 * No order execution, no network calls, no live trading.
 */

import type { ExecutionQueueItem } from "./executionQueueTypes";
import type { SafetyState } from "../safety/safetyTypes";
import { listQueueItems, expireQueueItem } from "./executionQueueStore";
import { createAuditEvent } from "../audit/auditStore";
import { createLocalNotification } from "../notifications/localNotificationStore";

const EXPIRING_SOON_MS = 60 * 60 * 1000; // 1 hour

// ─── Queue Item Health ─────────────────────────────────

export type QueueItemHealth = {
  expired: boolean;
  expiringSoon: boolean;
  recoverable: boolean;
  blockedByKillSwitch: boolean;
};

/** Get the health status of a single queue item. */
export function getQueueItemHealth(item: ExecutionQueueItem, now: number, killSwitchEnabled: boolean): QueueItemHealth {
  const isOverdue = now > item.expiresAt;
  const isSoon = !isOverdue && (item.expiresAt - now) < EXPIRING_SOON_MS;
  const isQueued = item.status === "queued-preview-only";

  return {
    expired: isQueued && isOverdue,
    expiringSoon: isQueued && isSoon && !isOverdue,
    recoverable: isQueued && !isOverdue && !killSwitchEnabled,
    blockedByKillSwitch: isQueued && !isOverdue && killSwitchEnabled,
  };
}

// ─── Expiration Detection ───────────────────────────────

/** Find items that should be marked as expired (past expiresAt, still queued). */
export function findExpiredQueueItems(items: ExecutionQueueItem[], now: number): ExecutionQueueItem[] {
  return items.filter((item) => item.status === "queued-preview-only" && now > item.expiresAt);
}

/** Find items that are expiring within the next hour. */
export function findExpiringSoonQueueItems(items: ExecutionQueueItem[], now: number): ExecutionQueueItem[] {
  return items.filter(
    (item) =>
      item.status === "queued-preview-only" &&
      now < item.expiresAt &&
      item.expiresAt - now < EXPIRING_SOON_MS,
  );
}

/** Find items that are recoverable (queued, not expired, kill switch off). */
export function findRecoverableQueueItems(items: ExecutionQueueItem[], killSwitchEnabled: boolean, now?: number): ExecutionQueueItem[] {
  const timestamp = now ?? Date.now();
  return items.filter(
    (item) =>
      item.status === "queued-preview-only" &&
      timestamp <= item.expiresAt &&
      !killSwitchEnabled,
  );
}

// ─── Queue Health Summary ───────────────────────────────

export type QueueHealthSummary = {
  total: number;
  queued: number;
  cancelled: number;
  expired: number;
  expiringSoon: number;
  recoverable: number;
  killSwitchEnabled: boolean;
  warnings: string[];
};

/** Build a health summary for the entire queue. */
export function buildQueueHealthSummary(items: ExecutionQueueItem[], safetyState: SafetyState, now?: number): QueueHealthSummary {
  const timestamp = now ?? Date.now();
  const warnings: string[] = [];
  const queued = items.filter((i) => i.status === "queued-preview-only").length;
  const expired = items.filter((i) => i.status === "expired").length;
  const cancelled = items.filter((i) => i.status === "cancelled").length;
  const expiringSoon = findExpiringSoonQueueItems(items, timestamp).length;
  const recoverable = findRecoverableQueueItems(items, safetyState.killSwitchEnabled, timestamp).length;

  if (safetyState.killSwitchEnabled) warnings.push("Kill Switch 已启用 — 队列无法处理新项目");
  if (expiringSoon > 0) warnings.push(`${expiringSoon} 个项目即将过期`);
  if (expired > 0) warnings.push(`${expired} 个项目已过期`);

  return {
    total: items.length,
    queued,
    cancelled,
    expired,
    expiringSoon,
    recoverable,
    killSwitchEnabled: safetyState.killSwitchEnabled,
    warnings,
  };
}

// ─── Expire Due Items (side-effect: updates localStorage + audit + notification) ──

/**
 * Find all overdue queued items and mark them as expired.
 * Generates audit events and local notifications for each expired item.
 * @returns The number of items expired.
 */
export function expireDueQueueItems(now?: number): number {
  const timestamp = now ?? Date.now();
  const items = listQueueItems();
  const toExpire = findExpiredQueueItems(items, timestamp);

  for (const item of toExpire) {
    expireQueueItem(item.id);

    createAuditEvent({
      eventType: "execution_queue_expired",
      entityType: "execution_queue",
      entityId: item.id,
      symbol: item.symbol,
      strategyName: item.strategyName,
      severity: "info",
      message: `队列项目已过期: ${item.symbol}`,
    });

    createLocalNotification({
      type: "queue",
      severity: "warning",
      title: "队列项目已过期",
      message: `${item.symbol} — ${item.strategyName}`,
      entityType: "execution_queue",
      entityId: item.id,
      symbol: item.symbol,
    });
  }

  return toExpire.length;
}
