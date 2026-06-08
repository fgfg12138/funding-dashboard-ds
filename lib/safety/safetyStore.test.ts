import { beforeEach, describe, expect, it } from "vitest";
import { clearSafetyState, disableKillSwitch, enableKillSwitch, getSafetyState, isKillSwitchEnabled } from "./safetyStore";

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
});

describe("safetyStore", () => {
  it("default state has killSwitchEnabled=false", () => {
    const state = getSafetyState();
    expect(state.killSwitchEnabled).toBe(false);
    expect(state.reason).toBeNull();
    expect(state.source).toBe("local");
  });

  it("isKillSwitchEnabled returns false by default", () => {
    expect(isKillSwitchEnabled()).toBe(false);
  });

  it("enableKillSwitch sets killSwitchEnabled=true with reason", () => {
    const state = enableKillSwitch("Market volatility");
    expect(state.killSwitchEnabled).toBe(true);
    expect(state.reason).toBe("Market volatility");
    expect(state.enabledBy).toBe("local-user");
    expect(state.enabledAt).toBeGreaterThan(0);
    expect(state.disabledAt).toBeNull();
    expect(isKillSwitchEnabled()).toBe(true);
  });

  it("enableKillSwitch with system actor", () => {
    const state = enableKillSwitch("System shutdown", "system");
    expect(state.enabledBy).toBe("system");
  });

  it("disableKillSwitch sets killSwitchEnabled=false", () => {
    enableKillSwitch("Test");
    const state = disableKillSwitch();
    expect(state.killSwitchEnabled).toBe(false);
    expect(state.disabledAt).toBeGreaterThan(0);
    expect(isKillSwitchEnabled()).toBe(false);
  });

  it("enable -> disable -> enable preserves reason", () => {
    enableKillSwitch("High volatility");
    disableKillSwitch();
    const reEnabled = enableKillSwitch("Still high");
    expect(reEnabled.killSwitchEnabled).toBe(true);
    expect(reEnabled.reason).toBe("Still high");
  });

  it("clearSafetyState resets to defaults", () => {
    enableKillSwitch("Something");
    clearSafetyState();
    const state = getSafetyState();
    expect(state.killSwitchEnabled).toBe(false);
    expect(state.reason).toBeNull();
  });

  it("source is always local", () => {
    expect(getSafetyState().source).toBe("local");
    expect(enableKillSwitch("x").source).toBe("local");
    expect(disableKillSwitch().source).toBe("local");
  });
});
