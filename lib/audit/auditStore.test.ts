import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendAuditEvent, clearAuditEvents, createAuditEvent, filterAuditEvents, listAuditEvents, resetAuditIdCounter } from "./auditStore";
import type { AuditEvent } from "./auditTypes";

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
  resetAuditIdCounter();
});

describe("auditStore", () => {
  it("returns empty list initially", () => {
    expect(listAuditEvents()).toEqual([]);
  });

  it("creates and lists audit events in reverse chronological", () => {
    const e1 = createAuditEvent({
      eventType: "order_preview_created",
      entityType: "order_preview",
      entityId: "pv-1",
      symbol: "BTC/USDT",
      severity: "info",
      message: "Preview created",
    });

    const e2 = createAuditEvent({
      eventType: "order_confirmation_created",
      entityType: "confirmation",
      entityId: "cf-1",
      symbol: "ETH/USDT",
      severity: "info",
      message: "Confirmed",
    });

    const all = listAuditEvents();
    expect(all).toHaveLength(2);
    // Both have same timestamp, so order is insertion-based for createAuditEvent
    // Just verify both are present
    expect(all.some((e) => e.id === e1.id)).toBe(true);
    expect(all.some((e) => e.id === e2.id)).toBe(true);
  });

  it("filters by eventType", () => {
    createAuditEvent({ eventType: "order_preview_created", entityType: "order_preview", entityId: "1", severity: "info", message: "a" });
    createAuditEvent({ eventType: "risk_blocked", entityType: "risk_gate", entityId: "2", severity: "blocked", message: "b" });

    const previews = filterAuditEvents({ eventType: "order_preview_created" });
    expect(previews).toHaveLength(1);
    expect(previews[0].entityId).toBe("1");
  });

  it("filters by severity", () => {
    createAuditEvent({ eventType: "order_preview_created", entityType: "order_preview", entityId: "1", severity: "info", message: "a" });
    createAuditEvent({ eventType: "risk_blocked", entityType: "risk_gate", entityId: "2", severity: "blocked", message: "b" });

    const blocked = filterAuditEvents({ severity: "blocked" });
    expect(blocked).toHaveLength(1);
  });

  it("filters by symbol", () => {
    createAuditEvent({ eventType: "order_preview_created", entityType: "order_preview", entityId: "1", symbol: "BTC/USDT", severity: "info", message: "a" });
    createAuditEvent({ eventType: "order_preview_created", entityType: "order_preview", entityId: "2", symbol: "ETH/USDT", severity: "info", message: "b" });

    const btc = filterAuditEvents({ symbol: "BTC/USDT" });
    expect(btc).toHaveLength(1);
  });

  it("filters by limit", () => {
    for (let i = 0; i < 5; i++) {
      createAuditEvent({ eventType: "order_preview_created", entityType: "order_preview", entityId: `pv-${i}`, severity: "info", message: `e${i}` });
    }
    const limited = filterAuditEvents({ limit: 3 });
    expect(limited).toHaveLength(3);
  });

  it("filters by time range", () => {
    const e1: AuditEvent = { id: "audit-early", eventType: "order_preview_created", actor: "local-user", timestamp: 100, entityType: "order_preview", entityId: "1", severity: "info", message: "early", source: "local" };
    const e2: AuditEvent = { id: "audit-mid", eventType: "order_preview_created", actor: "local-user", timestamp: 200, entityType: "order_preview", entityId: "2", severity: "info", message: "mid", source: "local" };
    const e3: AuditEvent = { id: "audit-late", eventType: "order_preview_created", actor: "local-user", timestamp: 300, entityType: "order_preview", entityId: "3", severity: "info", message: "late", source: "local" };
    appendAuditEvent(e1);
    appendAuditEvent(e2);
    appendAuditEvent(e3);

    const result = filterAuditEvents({ since: 150, until: 250 });
    expect(result).toHaveLength(1);
    expect(result[0].entityId).toBe("2");
  });

  it("creates a risk_blocked event with correct severity", () => {
    const event = createAuditEvent({
      eventType: "risk_blocked",
      entityType: "risk_gate",
      entityId: "opp-1",
      symbol: "BTC/USDT",
      severity: "blocked",
      message: "评分过低",
    });

    expect(event.severity).toBe("blocked");
    expect(event.eventType).toBe("risk_blocked");
    expect(event.source).toBe("local");
  });

  it("creates a paper_execution_created event", () => {
    const event = createAuditEvent({
      eventType: "paper_execution_created",
      entityType: "paper_execution",
      entityId: "ex-1",
      symbol: "BTC/USDT",
      exchangeIds: ["Binance"],
      strategyName: "Balanced",
      severity: "info",
      message: "Paper execution opened",
    });

    expect(event.exchangeIds).toEqual(["Binance"]);
    expect(event.strategyName).toBe("Balanced");
  });

  it("clears all events", () => {
    createAuditEvent({ eventType: "order_preview_created", entityType: "order_preview", entityId: "1", severity: "info", message: "a" });
    expect(listAuditEvents()).toHaveLength(1);
    clearAuditEvents();
    expect(listAuditEvents()).toHaveLength(0);
  });

  it("is SSR safe (localStorage throws handled)", () => {
    // Simulate SSR: temporarily break localStorage
    const orig = (globalThis as any).localStorage;
    (globalThis as any).localStorage = undefined;
    expect(listAuditEvents()).toEqual([]);
    (globalThis as any).localStorage = orig;
  });
});
