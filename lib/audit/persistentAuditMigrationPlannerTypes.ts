/**
 * Persistent Audit Migration Planner Types — Phase 6.13 Dry-Run
 *
 * Types for the migration dry-run planner.
 * No database connection, no SQL execution, no file writes.
 */

// ─── Dry-Run Input ───────────────────────────────────────

export type PersistentAuditMigrationTarget = "sqlite";

export type PersistentAuditMigrationDryRunInput = {
  target: PersistentAuditMigrationTarget;
  currentVersion: number;
  targetVersion: number;
  allowExecution: false;
  source: "persistent-audit-migration-dry-run";
};

// ─── Dry-Run Step ────────────────────────────────────────

export type PersistentAuditMigrationDryRunStep = {
  id: string;
  version: number;
  name: string;
  statementCount: number;
  reversible: boolean;
  executionStatus: "planned-only";
};

// ─── Dry-Run Result ──────────────────────────────────────

export type PersistentAuditMigrationDryRunResult = {
  executable: false;
  valid: boolean;
  steps: PersistentAuditMigrationDryRunStep[];
  warnings: string[];
  errors: string[];
  source: "persistent-audit-migration-dry-run";
};

// ─── Dry-Run Summary ─────────────────────────────────────

export type PersistentAuditMigrationDryRunSummary = {
  totalSteps: number;
  totalStatements: number;
  warnings: number;
  errors: number;
  valid: boolean;
  executable: false;
};
