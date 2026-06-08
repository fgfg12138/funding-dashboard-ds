/**
 * Safety Store — localStorage backed Kill Switch.
 *
 * When enabled, the system blocks new order previews, confirmations,
 * and queue additions. Existing data is NOT deleted.
 * No network calls, no API Key access, no real order interaction.
 */

import type { SafetyState } from "./safetyTypes";

const STORAGE_KEY = "safety-state";

const DEFAULT_STATE: SafetyState = {
  killSwitchEnabled: false,
  reason: null,
  enabledBy: "local-user",
  enabledAt: null,
  disabledAt: null,
  updatedAt: 0,
  source: "local",
};

function read(): SafetyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function write(state: SafetyState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // silently fail
  }
}

/** Get the current safety state. */
export function getSafetyState(): SafetyState {
  return read();
}

/** Check if the Kill Switch is enabled. */
export function isKillSwitchEnabled(): boolean {
  return read().killSwitchEnabled;
}

/**
 * Enable the Kill Switch.
 * @param reason  Human-readable reason (required).
 * @param enabledBy  Who triggered the enable (default "local-user").
 * @returns Updated SafetyState.
 */
export function enableKillSwitch(reason: string, enabledBy: "local-user" | "system" = "local-user"): SafetyState {
  const now = Date.now();
  const state: SafetyState = {
    killSwitchEnabled: true,
    reason,
    enabledBy,
    enabledAt: now,
    disabledAt: null,
    updatedAt: now,
    source: "local",
  };
  write(state);
  return state;
}

/**
 * Disable the Kill Switch.
 * @returns Updated SafetyState.
 */
export function disableKillSwitch(): SafetyState {
  const prev = read();
  const state: SafetyState = {
    ...prev,
    killSwitchEnabled: false,
    disabledAt: Date.now(),
    updatedAt: Date.now(),
  };
  write(state);
  return state;
}

/** Reset safety state to defaults. */
export function clearSafetyState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // silently fail
  }
}
