/**
 * Spread Paper Trader — Barrel Export
 */

export type {
  SpreadPaperLeg,
  SpreadPaperPosition,
  SpreadPaperPositionStatus,
  SpreadFundingEvent,
  SpreadPaperTraderState,
  SpreadPaperTraderConfig,
} from "./spreadPaperTraderTypes";

export { DEFAULT_PAPER_TRADER_CONFIG } from "./spreadPaperTraderTypes";

export {
  createInitialState,
  createSpreadPaperPosition,
  accrueSpreadFunding,
  updateSpreadPaperPosition,
  evaluateSpreadExit,
  closeSpreadPaperPosition,
  runSpreadPaperTraderStep,
  generateSpreadPaperTraderReport,
} from "./spreadPaperTraderEngine";

export type { SpreadPaperTraderReport, SpreadExitReason } from "./spreadPaperTraderEngine";
