import type { ExchangeName } from "../exchanges/types";
import type { TradingOrderRequest, TradingOrderSandboxStatus, TradingOrderResult } from "./tradingAdapterTypes";

export type SandboxLifecycleWarningFlag =
  | "mock-sandbox-only"
  | "not-submitted"
  | "submission-failed"
  | "cancellation-failed";

export type SandboxOrderLifecycleRecord = {
  id: string;
  queueItemId?: string;
  confirmationId?: string;
  previewId?: string;
  opportunityId: string;
  symbol: string;
  exchangeId: ExchangeName;
  request: TradingOrderRequest;
  /** Ordered history of result transitions. */
  resultHistory: TradingOrderResult[];
  /** Current status (latest result status, or 'sandbox-ready' if no submission yet). */
  currentStatus: TradingOrderSandboxStatus;
  source: "mock-sandbox";
  createdAt: number;
  updatedAt: number;
  submittedAt: number | null;
  filledAt: number | null;
  cancelledAt: number | null;
  failedAt: number | null;
  warningFlags: SandboxLifecycleWarningFlag[];
};

export type CreateLifecycleInput = {
  queueItemId?: string;
  confirmationId?: string;
  previewId?: string;
  opportunityId: string;
  symbol: string;
  exchangeId: ExchangeName;
  request: TradingOrderRequest;
};
