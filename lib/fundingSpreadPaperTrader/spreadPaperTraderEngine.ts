/**
 * Spread Paper Trader Engine — Cross-Exchange Paper Trader
 *
 * Simulates cross-exchange funding spread arbitrage using
 * Mock Connectors. No real API calls — pure paper simulation.
 */

import type { ExchangeConnector } from "../connectors/connectorTypes";
import type { FundingSpreadOpportunity } from "../fundingSpread/fundingSpreadTypes";
import { findCrossExchangeFundingSpreads, rankFundingSpreadOpportunities } from "../fundingSpread/fundingSpreadEngine";
import { DEFAULT_SPREAD_CONFIG } from "../fundingSpread/fundingSpreadTypes";
import type {
  SpreadPaperPosition,
  SpreadPaperLeg,
  SpreadPaperTraderState,
  SpreadFundingEvent,
  SpreadPaperTraderConfig,
} from "./spreadPaperTraderTypes";
import { DEFAULT_PAPER_TRADER_CONFIG } from "./spreadPaperTraderTypes";

// ─── State Helpers ─────────────────────────────────────

export function createInitialState(config: SpreadPaperTraderConfig): SpreadPaperTraderState {
  return {
    openPositions: [],
    closedPositions: [],
    fundingEvents: [],
    currentTime: Date.now(),
    totalCapitalUsd: config.totalCapitalUsd,
  };
}

// ─── 1. Create Paper Position ──────────────────────────

let _posSeq = 0;

export function createSpreadPaperPosition(
  opportunity: FundingSpreadOpportunity,
  state: SpreadPaperTraderState,
  config: SpreadPaperTraderConfig = DEFAULT_PAPER_TRADER_CONFIG,
): { position: SpreadPaperPosition; newState: SpreadPaperTraderState } {
  _posSeq++;
  const positionSize = Math.min(config.positionSizeUsd, config.totalCapitalUsd * (1 - config.reserveRatio));

  const shortLeg: SpreadPaperLeg = {
    exchangeId: opportunity.shortExchangeId,
    side: "short",
    fundingRate: opportunity.shortLeg.fundingRate,
    markPrice: opportunity.shortLeg.markPrice,
    notionalUsd: positionSize,
    fundingCollectedUsd: 0,
    unrealizedPnlUsd: 0,
  };

  const longLeg: SpreadPaperLeg = {
    exchangeId: opportunity.longExchangeId,
    side: "long",
    fundingRate: opportunity.longLeg.fundingRate,
    markPrice: opportunity.longLeg.markPrice,
    notionalUsd: positionSize,
    fundingCollectedUsd: 0,
    unrealizedPnlUsd: 0,
  };

  const position: SpreadPaperPosition = {
    id: `paper-spread-${String(_posSeq).padStart(4, "0")}`,
    canonicalSymbol: opportunity.canonicalSymbol,
    status: "open",
    openedAt: state.currentTime,
    shortExchangeId: opportunity.shortExchangeId,
    longExchangeId: opportunity.longExchangeId,
    shortLeg,
    longLeg,
    positionSizeUsd: positionSize,
    entrySpreadRate: opportunity.spreadRate,
    currentSpreadRate: opportunity.spreadRate,
    fundingCollectedUsd: 0,
    tradingPnlUsd: 0,
    totalPnlUsd: 0,
    holdingHours: 0,
  };

  const newState: SpreadPaperTraderState = {
    ...state,
    openPositions: [...state.openPositions, position],
    currentTime: state.currentTime,
  };

  return { position, newState };
}

// ─── 2. Accrue Funding ────────────────────────────────

export function accrueSpreadFunding(
  position: SpreadPaperPosition,
  intervals: number,
  state: SpreadPaperTraderState,
): { position: SpreadPaperPosition; events: SpreadFundingEvent[]; newState: SpreadPaperTraderState } {
  const events: SpreadFundingEvent[] = [];
  const now = state.currentTime;

  // Short leg: positive funding rate → receive; negative → pay
  const shortFundingAmount = position.shortLeg.notionalUsd * position.shortLeg.fundingRate * intervals;
  const shortDirection = shortFundingAmount >= 0 ? "receive" : "pay";
  const shortLegAmount = shortFundingAmount; // positive = receive

  const shortEvent: SpreadFundingEvent = {
    positionId: position.id,
    exchangeId: position.shortExchangeId,
    canonicalSymbol: position.canonicalSymbol,
    side: "short",
    fundingRate: position.shortLeg.fundingRate,
    amountUsd: shortLegAmount,
    occurredAt: now,
  };

  // Long leg: positive funding rate → pay; negative → receive
  const longFundingAmount = -(position.longLeg.notionalUsd * position.longLeg.fundingRate * intervals);
  // Long position: if funding rate is positive, the LONG pays funding (receive = false)
  const longEvent: SpreadFundingEvent = {
    positionId: position.id,
    exchangeId: position.longExchangeId,
    canonicalSymbol: position.canonicalSymbol,
    side: "long",
    fundingRate: position.longLeg.fundingRate,
    amountUsd: longFundingAmount,
    occurredAt: now,
  };

  events.push(shortEvent, longEvent);

  const totalFunding = shortLegAmount + longFundingAmount;

  const updatedPosition: SpreadPaperPosition = {
    ...position,
    shortLeg: { ...position.shortLeg, fundingCollectedUsd: position.shortLeg.fundingCollectedUsd + shortLegAmount },
    longLeg: { ...position.longLeg, fundingCollectedUsd: position.longLeg.fundingCollectedUsd + longFundingAmount },
    fundingCollectedUsd: position.fundingCollectedUsd + totalFunding,
    totalPnlUsd: position.totalPnlUsd + totalFunding,
  };

  const newState: SpreadPaperTraderState = {
    ...state,
    openPositions: state.openPositions.map((p) => (p.id === position.id ? updatedPosition : p)),
    fundingEvents: [...state.fundingEvents, ...events],
    currentTime: now,
  };

  return { position: updatedPosition, events, newState };
}

// ─── 3. Update Position ───────────────────────────────

export function updateSpreadPaperPosition(
  position: SpreadPaperPosition,
  newShortFundingRate: number,
  newLongFundingRate: number,
  shortMarkPrice: number,
  longMarkPrice: number,
  state: SpreadPaperTraderState,
): { position: SpreadPaperPosition; newState: SpreadPaperTraderState } {
  const newSpreadRate = newShortFundingRate - newLongFundingRate;
  const shortPriceChange = shortMarkPrice - position.shortLeg.markPrice;
  const longPriceChange = longMarkPrice - position.longLeg.markPrice;
  const shortPnl = -(shortPriceChange / position.shortLeg.markPrice) * position.shortLeg.notionalUsd;
  const longPnl = (longPriceChange / position.longLeg.markPrice) * position.longLeg.notionalUsd;
  const tradingPnl = shortPnl + longPnl;

  const updatedPosition: SpreadPaperPosition = {
    ...position,
    currentSpreadRate: newSpreadRate,
    shortLeg: { ...position.shortLeg, fundingRate: newShortFundingRate, markPrice: shortMarkPrice, unrealizedPnlUsd: shortPnl },
    longLeg: { ...position.longLeg, fundingRate: newLongFundingRate, markPrice: longMarkPrice, unrealizedPnlUsd: longPnl },
    tradingPnlUsd: position.tradingPnlUsd + tradingPnl,
    totalPnlUsd: position.totalPnlUsd + tradingPnl,
  };

  const newState: SpreadPaperTraderState = {
    ...state,
    openPositions: state.openPositions.map((p) => (p.id === position.id ? updatedPosition : p)),
    currentTime: state.currentTime,
  };

  return { position: updatedPosition, newState };
}

// ─── 4. Evaluate Exit ───────────────────────────────

export type SpreadExitReason =
  | { type: "spread_narrowed"; detail: string }
  | { type: "max_holding_hours"; detail: string }
  | { type: "take_profit"; detail: string }
  | { type: "stop_loss"; detail: string }
  | { type: "none" };

export function evaluateSpreadExit(
  position: SpreadPaperPosition,
  config: SpreadPaperTraderConfig = DEFAULT_PAPER_TRADER_CONFIG,
): SpreadExitReason {
  // Spread narrowed below threshold
  if (position.currentSpreadRate < position.entrySpreadRate * config.exitSpreadRateThreshold) {
    return {
      type: "spread_narrowed",
      detail: `Spread ${(position.currentSpreadRate * 100).toFixed(4)}% < threshold ${(position.entrySpreadRate * config.exitSpreadRateThreshold * 100).toFixed(4)}%`,
    };
  }

  // Max holding hours exceeded
  if (position.holdingHours >= config.maxHoldingHours) {
    return { type: "max_holding_hours", detail: `Held ${position.holdingHours.toFixed(1)}h > max ${config.maxHoldingHours}h` };
  }

  // Take profit
  if (config.takeProfitUsd !== undefined && position.totalPnlUsd >= config.takeProfitUsd) {
    return { type: "take_profit", detail: `PnL $${position.totalPnlUsd.toFixed(2)} >= take profit $${config.takeProfitUsd}` };
  }

  // Stop loss
  if (config.stopLossUsd !== undefined && position.totalPnlUsd <= -config.stopLossUsd) {
    return { type: "stop_loss", detail: `PnL $${position.totalPnlUsd.toFixed(2)} <= stop loss -$${config.stopLossUsd}` };
  }

  return { type: "none" };
}

// ─── 5. Close Position ──────────────────────────────

export function closeSpreadPaperPosition(
  position: SpreadPaperPosition,
  reason: SpreadExitReason,
  state: SpreadPaperTraderState,
): { closedPosition: SpreadPaperPosition; newState: SpreadPaperTraderState } {
  const closedPosition: SpreadPaperPosition = {
    ...position,
    status: "closed",
    closedAt: state.currentTime,
    holdingHours: (state.currentTime - position.openedAt) / (3600 * 1000),
    metadata: { exitReason: reason.type, exitDetail: reason.detail },
  };

  const newState: SpreadPaperTraderState = {
    ...state,
    openPositions: state.openPositions.filter((p) => p.id !== position.id),
    closedPositions: [...state.closedPositions, closedPosition],
    currentTime: state.currentTime,
  };

  return { closedPosition, newState };
}

// ─── 6. Main Step ────────────────────────────────────

export async function runSpreadPaperTraderStep(
  connectors: Record<string, ExchangeConnector>,
  symbols: string[],
  state: SpreadPaperTraderState,
  paperConfig: SpreadPaperTraderConfig = DEFAULT_PAPER_TRADER_CONFIG,
): Promise<{ newState: SpreadPaperTraderState; report: SpreadPaperTraderReport }> {
  let currentState = { ...state, currentTime: Date.now() };

  // Find opportunities
  const opportunities = await findCrossExchangeFundingSpreads(
    connectors,
    symbols,
    { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 },
  );

  // Exit positions that need closing
  for (const pos of currentState.openPositions) {
    pos.holdingHours = (currentState.currentTime - pos.openedAt) / (3600 * 1000);
    const exitReason = evaluateSpreadExit(pos, paperConfig);
    if (exitReason.type !== "none") {
      const result = closeSpreadPaperPosition(pos, exitReason, currentState);
      currentState = result.newState;
    }
  }

  // Open new positions if under limit
  const openSymbols = new Set(currentState.openPositions.map((p) => p.canonicalSymbol));

  for (const opp of opportunities) {
    if (currentState.openPositions.length >= paperConfig.maxOpenPositions) break;
    if (openSymbols.has(opp.canonicalSymbol)) continue;
    if (opp.netSpreadApy < paperConfig.minNetSpreadApy) continue;

    const result = createSpreadPaperPosition(opp, currentState, paperConfig);
    currentState = result.newState;
    openSymbols.add(opp.canonicalSymbol);
  }

  const report = generateSpreadPaperTraderReport(currentState, paperConfig);
  return { newState: currentState, report };
}

// ─── 7. Generate Report ─────────────────────────────

export type SpreadPaperTraderReport = {
  totalCapitalUsd: number;
  allocatedCapitalUsd: number;
  capitalUtilizationPercent: number;
  openPositionCount: number;
  closedPositionCount: number;
  totalFundingCollectedUsd: number;
  totalTradingPnlUsd: number;
  totalPnlUsd: number;
  topPosition: SpreadPaperPosition | undefined;
};

export function generateSpreadPaperTraderReport(
  state: SpreadPaperTraderState,
  config: SpreadPaperTraderConfig = DEFAULT_PAPER_TRADER_CONFIG,
): SpreadPaperTraderReport {
  const allPositions = [...state.openPositions, ...state.closedPositions];
  const totalFunding = allPositions.reduce((s, p) => s + p.fundingCollectedUsd, 0);
  const totalTrading = allPositions.reduce((s, p) => s + p.tradingPnlUsd, 0);
  const totalPnl = allPositions.reduce((s, p) => s + p.totalPnlUsd, 0);
  const allocated = state.openPositions.reduce((s, p) => s + p.positionSizeUsd, 0);

  const sorted = [...allPositions].sort((a, b) => b.totalPnlUsd - a.totalPnlUsd);

  return {
    totalCapitalUsd: config.totalCapitalUsd,
    allocatedCapitalUsd: allocated,
    capitalUtilizationPercent: (allocated / config.totalCapitalUsd) * 100,
    openPositionCount: state.openPositions.length,
    closedPositionCount: state.closedPositions.length,
    totalFundingCollectedUsd: totalFunding,
    totalTradingPnlUsd: totalTrading,
    totalPnlUsd: totalPnl,
    topPosition: sorted[0],
  };
}
