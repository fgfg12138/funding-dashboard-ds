import type { OrderPreview } from "./orderPreviewTypes";

// ─── Confirmation Status ────────────────────────────────

/** Phase 4.2 only supports "confirmed-preview-only".  Real submission is Phase 4.3+. */
export type ConfirmationStatus = "confirmed-preview-only";

// ─── Confirmation Record ────────────────────────────────

export type ConfirmationRecord = {
  id: string;
  previewId: string;
  opportunityId: string;
  symbol: string;
  strategyName: string;
  confirmedAt: number;
  confirmedBy: "local-user";
  status: "confirmed-preview-only";
  riskAccepted: boolean;
  riskMessages: string[];
  previewSnapshot: OrderPreview;
  disclaimerAccepted: boolean;
};

// ─── Input ──────────────────────────────────────────────

export type CreateConfirmationInput = {
  preview: OrderPreview;
  riskAccepted: boolean;
  disclaimerAccepted: boolean;
};
