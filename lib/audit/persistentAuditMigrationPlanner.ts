/**
 * Persistent Audit Migration Dry-Run Planner — Phase 6.13
 *
 * Builds a dry-run migration plan from the SQLite schema.
 * No database connection. No SQL execution. No file writes.
 */

import { buildAuditSqliteMigrationPlan } from "./persistentAuditSqliteSchema";
import type {
  PersistentAuditMigrationDryRunInput,
  PersistentAuditMigrationDryRunResult,
  PersistentAuditMigrationDryRunStep,
  PersistentAuditMigrationDryRunSummary,
} from "./persistentAuditMigrationPlannerTypes";

/**
 * Build a dry-run migration plan.
 *
 * Rules:
 * 1. allowExecution must be false → otherwise valid=false
 * 2. target must be "sqlite" → otherwise valid=false
 * 3. targetVersion must be > currentVersion → otherwise valid=false
 * 4. All steps have executionStatus="planned-only"
 * 5. executable is always false
 *
 * @param input - The dry-run input.
 * @returns A dry-run result with planned-only steps.
 */
export function buildPersistentAuditMigrationDryRun(
  input: PersistentAuditMigrationDryRunInput,
): PersistentAuditMigrationDryRunResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Rule 1: allowExecution must be false
  if (input.allowExecution) {
    errors.push("allowExecution must be false — dry-run does not execute migrations");
  }

  // Rule 2: target must be sqlite
  if (input.target !== "sqlite") {
    errors.push(`Unsupported target: "${input.target}" — only "sqlite" is supported`);
  }

  // Rule 3: targetVersion must be > currentVersion
  if (input.targetVersion <= input.currentVersion) {
    errors.push(`targetVersion (${input.targetVersion}) must be greater than currentVersion (${input.currentVersion})`);
  }

  // Build steps from the SQLite schema (only if no target/version errors)
  const steps: PersistentAuditMigrationDryRunStep[] = [];
  if (errors.length === 0) {
    const migrationPlan = buildAuditSqliteMigrationPlan();

    for (const s of migrationPlan.steps) {
      if (s.version > input.currentVersion && s.version <= input.targetVersion) {
        steps.push({
          id: `step-v${s.version}`,
          version: s.version,
          name: s.name,
          statementCount: s.statements.length,
          reversible: s.reversible,
          executionStatus: "planned-only",
        });

        // Warn about non-reversible steps
        if (!s.reversible) {
          warnings.push(`Step v${s.version} ("${s.name}") is not reversible — verify before running`);
        }
      }
    }

    if (steps.length === 0) {
      warnings.push("No migration steps match the version range — nothing to plan");
    }
  }

  return {
    executable: false,
    valid: errors.length === 0,
    steps,
    warnings,
    errors,
    source: "persistent-audit-migration-dry-run",
  };
}

/**
 * Validate a dry-run migration result.
 *
 * @param result - The dry-run result to validate.
 * @returns The same result if valid, or a flagged invalid result.
 */
export function validatePersistentAuditMigrationDryRun(
  result: PersistentAuditMigrationDryRunResult,
): PersistentAuditMigrationDryRunResult {
  const errors = [...result.errors];

  if (result.executable) {
    errors.push("Executable must be false for dry-run");
  }

  for (const step of result.steps) {
    if (step.executionStatus !== "planned-only") {
      errors.push(`Step v${step.version} has unexpected executionStatus: "${step.executionStatus}"`);
    }
  }

  return {
    ...result,
    valid: errors.length === 0 && result.valid,
    errors,
  };
}

/**
 * Summarize a dry-run migration result.
 *
 * @param result - The dry-run result to summarize.
 * @returns A summary object.
 */
export function summarizePersistentAuditMigrationDryRun(
  result: PersistentAuditMigrationDryRunResult,
): PersistentAuditMigrationDryRunSummary {
  return {
    totalSteps: result.steps.length,
    totalStatements: result.steps.reduce((sum, s) => sum + s.statementCount, 0),
    warnings: result.warnings.length,
    errors: result.errors.length,
    valid: result.valid,
    executable: false,
  };
}
