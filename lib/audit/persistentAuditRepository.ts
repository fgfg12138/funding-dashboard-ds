/**
 * Persistent Audit Repository — Phase 6.10 Preparation
 *
 * Disabled skeleton implementation of the PersistentAuditRepository interface.
 * All methods return blocked/no-op/empty results.
 * No database connection. No file writes. No ORM imports.
 */

import type {
  PersistentAuditRepository,
  PersistentAuditEventFilters,
  PersistentAuditAppendResult,
  PersistentAuditVerifyResult,
  PersistentAuditExportResult,
  PersistentAuditPruneResult,
} from "./persistentAuditRepositoryTypes";
import type {
  PersistentAuditEvent,
  PersistentAuditRetentionPolicy,
  CreatePersistentAuditEventInput,
} from "./persistentAuditTypes";

const DISABLED_MESSAGE = "Persistent audit disabled — no database connected";

/**
 * Create a disabled persistent audit repository.
 * All methods return blocked/no-op — no real database access.
 *
 * @returns A PersistentAuditRepository that is fully disabled.
 */
export function createDisabledPersistentAuditRepository(): PersistentAuditRepository {
  return {
    source: "persistent-audit-disabled",

    async appendEvent(_event: CreatePersistentAuditEventInput): Promise<PersistentAuditAppendResult> {
      return {
        success: false,
        error: DISABLED_MESSAGE,
      };
    },

    async getEventById(_id: string): Promise<PersistentAuditEvent | null> {
      return null;
    },

    async listEvents(_filters?: PersistentAuditEventFilters): Promise<PersistentAuditEvent[]> {
      return [];
    },

    async verifyIntegrity(): Promise<PersistentAuditVerifyResult> {
      return {
        implemented: false,
        valid: false,
        checkedAt: Date.now(),
        totalEvents: 0,
        error: "Integrity verification not implemented — persistent audit disabled",
      };
    },

    async exportEvents(_filters?: PersistentAuditEventFilters): Promise<PersistentAuditExportResult> {
      return {
        implemented: false,
        eventCount: 0,
        format: "json",
        data: "[]",
      };
    },

    async pruneExpiredEvents(_policy: PersistentAuditRetentionPolicy): Promise<PersistentAuditPruneResult> {
      return {
        prunedCount: 0,
        remainingCount: 0,
      };
    },
  };
}
