export type AuditEventType =
  | "order_preview_created"
  | "order_preview_closed"
  | "order_confirmation_created"
  | "order_confirmation_rejected"
  | "risk_blocked"
  | "paper_execution_created"
  | "paper_execution_closed"
  | "execution_queue_enqueued"
  | "execution_queue_cancelled"
  | "execution_queue_expired"
  | "kill_switch_enabled"
  | "kill_switch_disabled";

export type AuditActor = "local-user" | "system";

export type AuditEntityType =
  | "opportunity"
  | "order_preview"
  | "confirmation"
  | "paper_execution"
  | "risk_gate"
  | "execution_queue"
  | "safety";

export type AuditSeverity = "info" | "warning" | "blocked" | "error";

export type AuditEvent = {
  id: string;
  eventType: AuditEventType;
  actor: AuditActor;
  timestamp: number;
  entityType: AuditEntityType;
  entityId: string;
  symbol?: string;
  exchangeIds?: string[];
  strategyName?: string;
  severity: AuditSeverity;
  message: string;
  metadata?: Record<string, unknown>;
  source: "local";
};

export type CreateAuditEventInput = {
  eventType: AuditEventType;
  actor?: AuditActor;
  entityType: AuditEntityType;
  entityId: string;
  symbol?: string;
  exchangeIds?: string[];
  strategyName?: string;
  severity: AuditSeverity;
  message: string;
  metadata?: Record<string, unknown>;
};

export type AuditEventFilters = {
  eventType?: AuditEventType;
  severity?: AuditSeverity;
  symbol?: string;
  actor?: AuditActor;
  since?: number;
  until?: number;
  limit?: number;
};
