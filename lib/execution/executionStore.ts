import type { ClosePaperExecutionInput, PaperExecution } from "./types";

const STORAGE_KEY = "paper-trades";

function readAll(): PaperExecution[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PaperExecution[];
  } catch {
    return [];
  }
}

function writeAll(executions: PaperExecution[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(executions));
  } catch {
    // Storage full or unavailable — silently fail
  }
}

/** Get every paper execution from localStorage. */
export function listPaperExecutions(): PaperExecution[] {
  return readAll();
}

/** Get only open executions. */
export function listOpenExecutions(): PaperExecution[] {
  return readAll().filter((e) => e.status === "opened");
}

/** Get only closed executions. */
export function listClosedExecutions(): PaperExecution[] {
  return readAll().filter((e) => e.status === "closed");
}

/**
 * Persist a paper execution (already fully built, e.g. by the engine).
 * @returns the updated full list.
 */
export function createPaperExecution(execution: PaperExecution): PaperExecution[] {
  const all = readAll();
  all.push(execution);
  writeAll(all);
  return all;
}

/**
 * Close a paper execution by id.
 * @returns the updated full list, or undefined if not found.
 */
export function closePaperExecution(
  input: ClosePaperExecutionInput,
): PaperExecution[] | undefined {
  const all = readAll();
  const index = all.findIndex((e) => e.id === input.id);
  if (index === -1) return undefined;
  const now = input.now ?? Date.now();
  all[index] = {
    ...all[index],
    status: "closed",
    closedAt: now,
    updatedAt: now,
    closeReason: input.closeReason ?? null,
  };
  writeAll(all);
  return all;
}

/** Remove all paper executions from localStorage. */
export function clearPaperExecutions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // silently fail
  }
}
