/**
 * Testnet Readiness Summary — Phase 5.26
 *
 * Aggregates the readiness checklist into a summary suitable
 * for display on the Readiness Dashboard.
 */

import { buildTestnetReadinessChecklist } from "./testnetReadinessChecklist";
import type { TestnetReadinessCategory, TestnetReadinessStatus } from "./testnetReadinessTypes";

// ─── Summary Types ───────────────────────────────────────

export type TestnetReadinessSummary = {
  total: number;
  pass: number;
  blocked: number;
  notStarted: number;
  requiredBlocked: number;
  ready: boolean;
  byCategory: Record<TestnetReadinessCategory, {
    total: number;
    pass: number;
    blocked: number;
    notStarted: number;
  }>;
};

export type RequiredBlocker = {
  id: string;
  category: TestnetReadinessCategory;
  label: string;
  status: TestnetReadinessStatus;
  blockingReason?: string;
};

// ─── Build Summary ───────────────────────────────────────

export function buildReadinessSummary(): TestnetReadinessSummary {
  const result = buildTestnetReadinessChecklist();
  const byCategory = {} as Record<TestnetReadinessCategory, {
    total: number; pass: number; blocked: number; notStarted: number;
  }>;

  for (const item of result.items) {
    if (!byCategory[item.category]) {
      byCategory[item.category] = { total: 0, pass: 0, blocked: 0, notStarted: 0 };
    }
    byCategory[item.category].total++;
    if (item.status === "pass") byCategory[item.category].pass++;
    if (item.status === "blocked") byCategory[item.category].blocked++;
    if (item.status === "not-started") byCategory[item.category].notStarted++;
  }

  return {
    total: result.total,
    pass: result.passed,
    blocked: result.blocked,
    notStarted: result.notStarted,
    requiredBlocked: result.requiredBlocked,
    ready: result.ready,
    byCategory,
  };
}

/**
 * Extract required blockers — items that are required and not pass.
 */
export function getRequiredBlockers(): RequiredBlocker[] {
  const result = buildTestnetReadinessChecklist();
  return result.items
    .filter((i) => i.required && i.status !== "pass")
    .map((i) => ({
      id: i.id,
      category: i.category,
      label: i.label,
      status: i.status,
      blockingReason: i.blockingReason,
    }));
}
