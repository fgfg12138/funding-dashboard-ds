import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activatePaperStrategyTemplate,
  deactivatePaperStrategyTemplate,
  getActivePaperTemplate,
  getPaperStrategyTemplate,
  listPaperStrategyTemplates,
  resetPaperStrategyTemplates,
  updatePaperStrategyTemplate,
} from "./paperStrategyStore";
import { DEFAULT_PAPER_STRATEGIES } from "./paperStrategyTypes";

function createMockStorage() {
  let store: Record<string, string> = {};
  return {
    getItem(key: string) { return store[key] ?? null; },
    setItem(key: string, value: string) { store[key] = value; },
    removeItem(key: string) { delete store[key]; },
    clear() { store = {}; },
    get length() { return Object.keys(store).length; },
    key(index: number) { return Object.keys(store)[index] ?? null; },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createMockStorage());
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("paperStrategyStore", () => {
  it("returns default templates on first read", () => {
    const all = listPaperStrategyTemplates();
    expect(all).toHaveLength(3);
    expect(all[0].name).toBe("Conservative Funding");
    expect(all[1].name).toBe("Balanced Funding");
    expect(all[2].name).toBe("Aggressive Funding");
  });

  it("no active template by default", () => {
    expect(getActivePaperTemplate()).toBeNull();
  });

  it("activates a template and enforces uniqueness", () => {
    const result = activatePaperStrategyTemplate("paper-conservative");
    expect(result).toBeDefined();
    expect(result!.enabledPaperTrading).toBe(true);

    const active = getActivePaperTemplate();
    expect(active).not.toBeNull();
    expect(active!.id).toBe("paper-conservative");

    // Activate another — first should be disabled
    activatePaperStrategyTemplate("paper-aggressive");
    const active2 = getActivePaperTemplate();
    expect(active2!.id).toBe("paper-aggressive");

    const all = listPaperStrategyTemplates();
    expect(all.find((t) => t.id === "paper-conservative")!.enabledPaperTrading).toBe(false);
    expect(all.find((t) => t.id === "paper-aggressive")!.enabledPaperTrading).toBe(true);
  });

  it("deactivates active template", () => {
    activatePaperStrategyTemplate("paper-balanced");
    expect(getActivePaperTemplate()).not.toBeNull();

    deactivatePaperStrategyTemplate();
    expect(getActivePaperTemplate()).toBeNull();
  });

  it("updates template fields", () => {
    const updated = updatePaperStrategyTemplate("paper-conservative", {
      minScore: 70,
      maxOpenExecutions: 3,
    });
    expect(updated).toBeDefined();
    expect(updated!.minScore).toBe(70);
    expect(updated!.maxOpenExecutions).toBe(3);
    // Other fields unchanged
    expect(updated!.name).toBe("Conservative Funding");
    expect(updated!.updatedAt).toBe(1_700_000_000_000);
  });

  it("returns undefined for unknown id update", () => {
    const result = updatePaperStrategyTemplate("non-existent", { minScore: 99 });
    expect(result).toBeUndefined();
  });

  it("resets to defaults after clear", () => {
    activatePaperStrategyTemplate("paper-aggressive");
    expect(getActivePaperTemplate()).not.toBeNull();

    resetPaperStrategyTemplates();
    const all = listPaperStrategyTemplates();
    expect(all).toHaveLength(3);
    expect(all.every((t) => t.enabledPaperTrading === false)).toBe(true);
    expect(getActivePaperTemplate()).toBeNull();
  });

  it("activating enables only one template", () => {
    activatePaperStrategyTemplate("paper-conservative");
    activatePaperStrategyTemplate("paper-balanced");
    activatePaperStrategyTemplate("paper-aggressive");

    const active = getActivePaperTemplate();
    expect(active!.id).toBe("paper-aggressive");

    const count = listPaperStrategyTemplates().filter((t) => t.enabledPaperTrading).length;
    expect(count).toBe(1);
  });
});
