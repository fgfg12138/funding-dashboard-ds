/**
 * Paper Trader Engine — Alpha Phase A8
 *
 * Automated paper trading simulation loop that wires together
 * Alpha A3–A7 into a single step:
 *
 *   allocateCapital → createPositions → accrueFunding → evaluateExit → closePositions → portfolioReport
 *
 * Pure functions — no side effects, no real trading.
 */

import type { ArbitragePosition } from "./arbitragePositionTypes";
import { closeArbitragePosition, createArbitragePosition } from "./arbitragePositionEngine";
import { allocateCapital } from "./capitalAllocationEngine";
import type { CapitalAllocationOpportunity } from "./capitalAllocationTypes";
import { evaluateExit } from "./exitEngine";
import type { ExitDecision } from "./exitEngineTypes";
import { accrueFunding, isFundingSettlementDue } from "./fundingAccrualEngine";
import type { FundingAccrualEvent, FundingAccrualInput } from "./fundingAccrualTypes";
import { calculatePortfolioReport } from "./portfolioEngine";
import type { PortfolioPositionInput } from "./portfolioTypes";
import type {
  PaperTraderConfig,
  PaperTraderOpportunity,
  PaperTraderState,
  PaperTraderStepResult,
} from "./paperTraderTypes";
import type { ExchangeName } from "../exchanges/types";

// ─── Defaults ────────────────────────────────────────────

const DEFAULTS = {
  reserveRatio: 0.1,
  minExpectedNetApy: 10,
  maxOpenPositions: 5,
  maxPositionUsd: 50_000,
  minPositionUsd: 1_000,
  maxAllocationPercentPerOpportunity: 0.5,
  maxDeltaPercent: 3,
  maxHoldingHours: 48,
  fundingDeclineThresholdPercent: 50,
  defaultFundingIntervalHours: 8,
};

// ─── Helpers ─────────────────────────────────────────────

function resolveConfig(c?: PaperTraderConfig): Required<PaperTraderConfig> {
  return {
    totalCapitalUsd: c?.totalCapitalUsd ?? 100_000,
    reserveRatio: c?.reserveRatio ?? DEFAULTS.reserveRatio,
    minExpectedNetApy: c?.minExpectedNetApy ?? DEFAULTS.minExpectedNetApy,
    maxOpenPositions: c?.maxOpenPositions ?? DEFAULTS.maxOpenPositions,
    maxPositionUsd: c?.maxPositionUsd ?? DEFAULTS.maxPositionUsd,
    minPositionUsd: c?.minPositionUsd ?? DEFAULTS.minPositionUsd,
    maxAllocationPercentPerOpportunity: c?.maxAllocationPercentPerOpportunity ?? DEFAULTS.maxAllocationPercentPerOpportunity,
    maxDeltaPercent: c?.maxDeltaPercent ?? DEFAULTS.maxDeltaPercent,
    maxHoldingHours: c?.maxHoldingHours ?? DEFAULTS.maxHoldingHours,
    fundingDeclineThresholdPercent: c?.fundingDeclineThresholdPercent ?? DEFAULTS.fundingDeclineThresholdPercent,
    defaultFundingIntervalHours: c?.defaultFundingIntervalHours ?? DEFAULTS.defaultFundingIntervalHours,
  };
}

/**
 * Convert a PaperTraderOpportunity to a CapitalAllocationOpportunity
 * for use with the capital allocation engine.
 */
function toCapitalAllocationOpp(
  opp: PaperTraderOpportunity,
  shouldExit: boolean,
): CapitalAllocationOpportunity {
  return {
    id: opp.id,
    symbol: opp.symbol,
    exchange: opp.exchange,
    expectedNetApy: opp.expectedNetApy,
    opportunityScore: opp.opportunityScore,
    riskScore: opp.riskScore,
    liquidityScore: opp.liquidityScore,
    capacityUsd: opp.capacityUsd,
    shouldExit,
  };
}

// ─── Public API ──────────────────────────────────────────

/**
 * Run one full paper trading step.
 *
 * Order of operations:
 * 1. Allocate capital to eligible opportunities (skip symbols already open)
 * 2. Open new positions from allocations (respecting maxOpenPositions)
 * 3. Accrue funding for open positions (when settlement is due)
 * 4. Evaluate exit conditions for open positions
 * 5. Close positions flagged for exit
 * 6. Build portfolio report
 *
 * Returns a new PaperTraderStepResult — the original state is NOT mutated.
 */
export function runPaperTraderStep(
  state: PaperTraderState,
  opportunities: PaperTraderOpportunity[],
  config: PaperTraderConfig,
  currentTime: number = Date.now(),
): PaperTraderStepResult {
  const cfg = resolveConfig(config);
  const openSymbols = new Set(state.openPositions.map((p) => p.symbol));

  // ── 1. Allocate capital ──────────────────────────────

  // Exclude symbols already open and convert to allocation format
  const allocOpps: CapitalAllocationOpportunity[] = opportunities
    .filter((opp) => !openSymbols.has(opp.symbol))
    .map((opp) => toCapitalAllocationOpp(opp, false));

  const openedPositions: ArbitragePosition[] = [];
  let newOpenPositions = [...state.openPositions];

  if (allocOpps.length > 0) {
    const allocResult = allocateCapital({
      totalCapitalUsd: cfg.totalCapitalUsd,
      reserveRatio: cfg.reserveRatio,
      opportunities: allocOpps,
      config: {
        minExpectedNetApy: cfg.minExpectedNetApy,
        maxPositionUsd: cfg.maxPositionUsd,
        minPositionUsd: cfg.minPositionUsd,
        maxAllocationPercentPerOpportunity: cfg.maxAllocationPercentPerOpportunity,
      },
    });

    // ── 2. Open positions from allocations ─────────────
    const maxCanOpen = cfg.maxOpenPositions - state.openPositions.length;

    for (let i = 0; i < allocResult.allocations.length && openedPositions.length < maxCanOpen; i++) {
      const alloc = allocResult.allocations[i];
      const opp = opportunities.find((o) => o.id === alloc.opportunityId);
      if (!opp) continue;

      const pos = createPaperPositionFromAllocation(alloc, opp, currentTime);
      openedPositions.push(pos);
      newOpenPositions.push(pos);
    }
  }

  // ── 3. Accrue funding for open positions ─────────────
  const newFundingEvents: FundingAccrualEvent[] = [];
  const afterFunding: ArbitragePosition[] = [];

  for (const pos of newOpenPositions) {
    const interval = cfg.defaultFundingIntervalHours;
    const lastSettlement = (pos.metadata?.lastFundingSettlementAt as number | undefined) ?? pos.openedAt;

    if (isFundingSettlementDue(lastSettlement, currentTime, interval)) {
      // Find matching opportunity for funding rate
      const opp = opportunities.find((o) => o.symbol === pos.symbol);
      const fundingRate = opp?.fundingRate ?? (pos.metadata?.entryFundingRate as number | undefined) ?? 0;

      const accrualInput: FundingAccrualInput = {
        position: pos,
        fundingRate,
        settledAt: currentTime,
        fundingIntervalHours: interval,
        exchange: opp?.exchange ?? pos.perpetualLeg.exchange,
      };

      const result = accrueFunding(accrualInput);
      newFundingEvents.push(result.event);

      // Update lastFundingSettlementAt in metadata
      const updated = {
        ...result.updatedPosition,
        metadata: {
          ...result.updatedPosition.metadata,
          lastFundingSettlementAt: currentTime,
          entryFundingRate: pos.metadata?.entryFundingRate,
        },
      };
      afterFunding.push(updated);
    } else {
      afterFunding.push(pos);
    }
  }

  // ── 4. Evaluate exits ────────────────────────────────
  const exitDecisions: ExitDecision[] = [];
  const toClose: string[] = [];

  for (const pos of afterFunding) {
    const opp = opportunities.find((o) => o.symbol === pos.symbol);

    const decision = evaluateExit(
      pos,
      {
        minNetApyPercent: cfg.minExpectedNetApy,
        maxDeltaPercent: cfg.maxDeltaPercent,
        maxHoldingHours: cfg.maxHoldingHours,
        fundingDeclineThresholdPercent: cfg.fundingDeclineThresholdPercent,
      },
      {
        currentTime,
        currentFundingRate: opp?.fundingRate,
        entryFundingRate: pos.metadata?.entryFundingRate as number | undefined,
        currentNetApy: opp?.expectedNetApy,
      },
    );

    exitDecisions.push(decision);
    if (decision.shouldExit) {
      toClose.push(pos.id);
    }
  }

  // ── 5. Close positions flagged for exit ──────────────
  const remainingOpen: ArbitragePosition[] = [];
  const newlyClosed: ArbitragePosition[] = [];

  for (const pos of afterFunding) {
    if (toClose.includes(pos.id)) {
      const opp = opportunities.find((o) => o.symbol === pos.symbol);
      const closePrice = opp?.markPrice ?? pos.perpetualLeg.markPrice;

      const closed = closeArbitragePosition(pos, {
        spotClosePrice: closePrice,
        perpClosePrice: closePrice,
        additionalFundingUsd: 0,
      });
      newlyClosed.push(closed);
    } else {
      remainingOpen.push(pos);
    }
  }

  const allClosed = [...state.closedPositions, ...newlyClosed];

  // ── 6. Build portfolio report ─────────────────────────
  const positionInputs: PortfolioPositionInput[] = [
    ...remainingOpen.map((p) => ({
      position: p,
      allocatedCapitalUsd: p.metadata?.allocatedCapitalUsd as number | undefined,
    })),
    ...allClosed.map((p) => ({
      position: p,
      allocatedCapitalUsd: p.metadata?.allocatedCapitalUsd as number | undefined,
    })),
  ];

  const portfolioReport = calculatePortfolioReport(positionInputs, {
    totalCapitalUsd: cfg.totalCapitalUsd,
    includeClosedPositions: true,
  });

  // ── 7. Build result ──────────────────────────────────
  const newState: PaperTraderState = {
    openPositions: remainingOpen,
    closedPositions: allClosed,
    fundingEvents: [...state.fundingEvents, ...newFundingEvents],
    lastRunAt: currentTime,
    portfolioReport,
  };

  return {
    state: newState,
    openedPositions,
    closedPositions: newlyClosed,
    fundingEvents: newFundingEvents,
    exitDecisions,
    portfolioReport,
    skippedOpportunities: [], // simplified — skipped captured implicitly in alloc result
    ranAt: currentTime,
  };
}

/**
 * Create a paper arbitrage position from a capital allocation result.
 *
 * Creates a standard long-spot / short-perp structure.
 *
 * Stores metadata:
 *   - lastFundingSettlementAt = currentTime
 *   - entryFundingRate = opportunity.fundingRate
 *   - allocatedCapitalUsd = allocated USD amount
 */
export function createPaperPositionFromAllocation(
  allocation: { opportunityId: string; symbol: string; allocatedUsd: number },
  opportunity: PaperTraderOpportunity,
  currentTime: number,
): ArbitragePosition {
  const quantity = allocation.allocatedUsd / opportunity.markPrice;

  return createArbitragePosition({
    symbol: opportunity.symbol,
    spotLeg: {
      exchange: (opportunity.exchange ?? "Binance") as ExchangeName,
      symbol: opportunity.symbol,
      marketType: "spot",
      side: "long",
      quantity,
      entryPrice: opportunity.markPrice,
      markPrice: opportunity.markPrice,
    },
    perpetualLeg: {
      exchange: (opportunity.exchange ?? "Binance") as ExchangeName,
      symbol: opportunity.symbol,
      marketType: "perpetual",
      side: "short",
      quantity,
      entryPrice: opportunity.markPrice,
      markPrice: opportunity.markPrice,
    },
    fundingCollectedUsd: 0,
    entryNetApy: opportunity.expectedNetApy,
    currentNetApy: opportunity.expectedNetApy,
    metadata: {
      lastFundingSettlementAt: currentTime,
      entryFundingRate: opportunity.fundingRate,
      allocatedCapitalUsd: allocation.allocatedUsd,
    },
  });
}
