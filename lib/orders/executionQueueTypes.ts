import type { OrderPreview } from "./orderPreviewTypes";
import type { ConfirmationRecord } from "./orderConfirmationTypes";

export type QueueItemStatus = "queued-preview-only" | "cancelled" | "expired";
export type QueuePriority = "low" | "normal" | "high";

export type ExecutionQueueItem = {
  id: string;
  confirmationId: string;
  previewId: string;
  opportunityId: string;
  symbol: string;
  strategyName: string;
  status: QueueItemStatus;
  priority: QueuePriority;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  warningFlags: string[];
  previewSnapshot: OrderPreview;
  confirmationSnapshot: ConfirmationRecord;
  source: "local";
};

export type QueueItemFilters = {
  status?: QueueItemStatus;
  symbol?: string;
  priority?: QueuePriority;
};

export type EnqueueInput = {
  confirmation: ConfirmationRecord;
  priority?: QueuePriority;
};
