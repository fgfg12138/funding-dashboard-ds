/**
 * Local Notification Store — localStorage backed.
 *
 * Records key events in the semi-automated trading flow as local notifications.
 * No external delivery (no Telegram, Email, Webhook).
 */

import type { LocalNotification, CreateLocalNotificationInput } from "./localNotificationTypes";

const STORAGE_KEY = "local-notifications";

let idCounter = 1;

function readAll(): LocalNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalNotification[];
  } catch {
    return [];
  }
}

function writeAll(all: LocalNotification[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // silently fail
  }
}

function generateId(): string {
  return `notif-${Date.now()}-${idCounter++}`;
}

/** Reset id counter for tests. */
export function resetNotificationIdCounter(): void {
  idCounter = 1;
}

/** Create a new notification and persist it. */
export function createLocalNotification(input: CreateLocalNotificationInput): LocalNotification {
  const notification: LocalNotification = {
    id: generateId(),
    type: input.type,
    severity: input.severity,
    title: input.title,
    message: input.message,
    entityType: input.entityType,
    entityId: input.entityId,
    symbol: input.symbol,
    createdAt: Date.now(),
    readAt: null,
    source: "local",
  };
  const all = readAll();
  all.push(notification);
  writeAll(all);
  return notification;
}

/** List all notifications, newest first. */
export function listLocalNotifications(): LocalNotification[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

/** Get count of unread notifications. */
export function unreadLocalNotificationCount(): number {
  return readAll().filter((n) => n.readAt === null).length;
}

/** Mark a single notification as read. Returns true if found. */
export function markLocalNotificationRead(id: string): boolean {
  const all = readAll();
  const idx = all.findIndex((n) => n.id === id);
  if (idx === -1) return false;
  all[idx] = { ...all[idx], readAt: Date.now() };
  writeAll(all);
  return true;
}

/** Mark all notifications as read. */
export function markAllLocalNotificationsRead(): void {
  const all = readAll().map((n) => (n.readAt === null ? { ...n, readAt: Date.now() } : n));
  writeAll(all);
}

/** Remove all notifications. */
export function clearLocalNotifications(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // silently fail
  }
}
