import type { PaperStrategyTemplate } from "./paperStrategyTypes";
import { DEFAULT_PAPER_STRATEGIES } from "./paperStrategyTypes";

const STORAGE_KEY = "paper-strategy-templates";

function readAll(): PaperStrategyTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_PAPER_STRATEGIES);
    return JSON.parse(raw) as PaperStrategyTemplate[];
  } catch {
    return structuredClone(DEFAULT_PAPER_STRATEGIES);
  }
}

function writeAll(templates: PaperStrategyTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Storage full — silently fail
  }
}

/** Get all paper strategy templates. */
export function listPaperStrategyTemplates(): PaperStrategyTemplate[] {
  return readAll();
}

/** Get the currently active (enabledPaperTrading=true) template, or null. */
export function getActivePaperTemplate(): PaperStrategyTemplate | null {
  const all = readAll();
  return all.find((t) => t.enabledPaperTrading) ?? null;
}

/** Get a template by id. */
export function getPaperStrategyTemplate(id: string): PaperStrategyTemplate | undefined {
  return readAll().find((t) => t.id === id);
}

/**
 * Update a template's fields.  Pass `id` and any partial fields.
 * If `enabledPaperTrading` is set to true, all other templates are set to false.
 */
export function updatePaperStrategyTemplate(
  id: string,
  partial: Partial<PaperStrategyTemplate>,
): PaperStrategyTemplate | undefined {
  const all = readAll();
  const index = all.findIndex((t) => t.id === id);
  if (index === -1) return undefined;

  const now = Date.now();
  const updated: PaperStrategyTemplate = {
    ...all[index],
    ...partial,
    id: all[index].id, // id is immutable
    updatedAt: now,
  };

  all[index] = updated;

  // Enforce uniqueness of enabledPaperTrading
  if (updated.enabledPaperTrading) {
    for (let i = 0; i < all.length; i++) {
      if (i !== index && all[i].enabledPaperTrading) {
        all[i] = { ...all[i], enabledPaperTrading: false, updatedAt: now };
      }
    }
  }

  writeAll(all);
  return updated;
}

/** Activate a template (set enabledPaperTrading=true, disable all others). */
export function activatePaperStrategyTemplate(id: string): PaperStrategyTemplate | undefined {
  return updatePaperStrategyTemplate(id, { enabledPaperTrading: true });
}

/** Deactivate the current active template. */
export function deactivatePaperStrategyTemplate(): void {
  const all = readAll();
  let changed = false;
  const now = Date.now();
  for (let i = 0; i < all.length; i++) {
    if (all[i].enabledPaperTrading) {
      all[i] = { ...all[i], enabledPaperTrading: false, updatedAt: now };
      changed = true;
    }
  }
  if (changed) writeAll(all);
}

/** Reset all templates to defaults (clears localStorage). */
export function resetPaperStrategyTemplates(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // silently fail
  }
}
