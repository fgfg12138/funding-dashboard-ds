import { beforeEach, describe, expect, it } from "vitest";
import { clearLocalNotifications, createLocalNotification, listLocalNotifications, markAllLocalNotificationsRead, markLocalNotificationRead, resetNotificationIdCounter, unreadLocalNotificationCount } from "./localNotificationStore";

const storage: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => { storage[k] = v; },
    removeItem: (k: string) => { delete storage[k]; },
    clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
  },
  writable: true,
  configurable: true,
});

beforeEach(() => {
  Object.keys(storage).forEach((k) => delete storage[k]);
  resetNotificationIdCounter();
});

describe("localNotificationStore", () => {
  it("creates a notification with correct fields", () => {
    const n = createLocalNotification({
      type: "risk",
      severity: "blocked",
      title: "Risk Blocked",
      message: "Score too low",
      entityType: "risk_gate",
      entityId: "opp-1",
      symbol: "BTC/USDT",
    });
    expect(n.id).toMatch(/^notif-/);
    expect(n.type).toBe("risk");
    expect(n.severity).toBe("blocked");
    expect(n.readAt).toBeNull();
    expect(n.source).toBe("local");
  });

  it("lists notifications newest first", () => {
    const n1 = createLocalNotification({ type: "system", severity: "info", title: "A", message: "", entityType: "x", entityId: "1" });
    const n2 = createLocalNotification({ type: "system", severity: "info", title: "B", message: "", entityType: "x", entityId: "2" });
    const all = listLocalNotifications();
    expect(all).toHaveLength(2);
    expect(all.some((n) => n.id === n1.id)).toBe(true);
    expect(all.some((n) => n.id === n2.id)).toBe(true);
  });

  it("unread count is correct", () => {
    expect(unreadLocalNotificationCount()).toBe(0);
    createLocalNotification({ type: "risk", severity: "blocked", title: "R", message: "", entityType: "rg", entityId: "1" });
    expect(unreadLocalNotificationCount()).toBe(1);
    createLocalNotification({ type: "confirmation", severity: "info", title: "C", message: "", entityType: "cf", entityId: "2" });
    expect(unreadLocalNotificationCount()).toBe(2);
  });

  it("marks a single notification as read", () => {
    const n = createLocalNotification({ type: "system", severity: "info", title: "T", message: "", entityType: "x", entityId: "1" });
    expect(markLocalNotificationRead("non-existent")).toBe(false);
    expect(markLocalNotificationRead(n.id)).toBe(true);
    const updated = listLocalNotifications().find((x) => x.id === n.id);
    expect(updated!.readAt).toBeGreaterThan(0);
    expect(unreadLocalNotificationCount()).toBe(0);
  });

  it("marks all as read", () => {
    createLocalNotification({ type: "system", severity: "info", title: "A", message: "", entityType: "x", entityId: "1" });
    createLocalNotification({ type: "system", severity: "info", title: "B", message: "", entityType: "x", entityId: "2" });
    markAllLocalNotificationsRead();
    expect(unreadLocalNotificationCount()).toBe(0);
  });

  it("clears all notifications", () => {
    createLocalNotification({ type: "system", severity: "info", title: "A", message: "", entityType: "x", entityId: "1" });
    expect(listLocalNotifications()).toHaveLength(1);
    clearLocalNotifications();
    expect(listLocalNotifications()).toHaveLength(0);
  });

  it("source is always local", () => {
    const n = createLocalNotification({ type: "system", severity: "info", title: "T", message: "", entityType: "x", entityId: "1" });
    expect(n.source).toBe("local");
  });
});
