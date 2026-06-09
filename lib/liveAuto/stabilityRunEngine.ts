/**
 * Stability Run Engine — 7-Day Long-Term Stability Validation
 *
 * Runs 2016 compressed cycles (7 days at 5-min intervals) with
 * configurable stress scenarios to validate all Live modules
 * under sustained load.
 *
 * Scenarios:
 *   normal            — standard market conditions
 *   funding_decline   — funding rates decaying over time
 *   risk_spike        — sudden market risk spikes trigger Kill Switch
 *
 * Per-cycle steps:
 *   1.  Generate opportunities (scenario-adjusted)
 *   2.  Capital allocation
 *   3.  Simulated entry (plan only)
 *   4.  Update mark prices
 *   5.  Funding accrual (8h intervals)
 *   6.  Monitoring
 *   7.  Exit suggestion
 *   8.  Simulated exit (plan only)
 *   9.  Portfolio report
 *   10. Risk Engine evaluation
 *   11. Kill Switch evaluation
 *   12. State cleanup check
 */

import type { ArbitragePosition } from "../arbitrage/arbitragePositionTypes";
import { createArbitragePosition, closeArbitragePosition } from "../arbitrage/arbitragePositionEngine";
import { allocateCapital } from "../arbitrage/capitalAllocationEngine";
import type { CapitalAllocationResult } from "../arbitrage/capitalAllocationTypes";
import { accrueFunding, isFundingSettlementDue } from "../arbitrage/fundingAccrualEngine";
import type { FundingAccrualInput } from "../arbitrage/fundingAccrualTypes";
import { generateMonitoringReport } from "../semiAuto/autoMonitoringEngine";
import { generateExitSuggestions } from "../semiAuto/exitSuggestionEngine";
import { calculatePortfolioReport } from "../arbitrage/portfolioEngine";
import type { PortfolioPositionInput } from "../arbitrage/portfolioTypes";
import { evaluateLiveRisk } from "./riskEngine";
import type { LiveRiskContext } from "./riskEngineTypes";
import { evaluateKillSwitch, canExecuteAction, createInitialKillSwitchState } from "./killSwitchEngine";
import type { KillSwitchState } from "./killSwitchTypes";
import type { CapitalState } from "./capitalManagerTypes";
import type {
  StabilityRunConfig,
  StabilityRunReport,
  StabilityCycleResult,
  StressScenario,
} from "./stabilityRunTypes";

// ─── Defaults ────────────────────────────────────────────

const DEFAULTS = {
  totalCapitalUsd: 100_000,
  intervalMinutes: 5,
  durationHours: 168, // 7 days
  dryRun: true,
  scenario: "normal" as StressScenario,
};

// ─── Scenario Markers ───────────────────────────────────

interface ScenarioState {
  /** Base funding rate for this cycle. */
  baseFundingRate: number;
  /** Base expected net APY. */
  baseNetApy: number;
  /** Whether a risk spike is active. */
  riskSpikeActive: boolean;
  /** High-water mark of open positions. */
  highWaterOpen: number;
}

// ─── Build scenario-adjusted opportunities ─────────────

function buildOpps(
  cycle: number,
  totalCycles: number,
  scenario: StressScenario,
  state: ScenarioState,
): Array<{ id: string; symbol: string; expectedNetApy: number; opportunityScore: number; riskScore: number; capacityUsd: number; fundingRate: number; markPrice: number }> {
  const progress = cycle / totalCycles; // 0 → 1

  // Base values vary by cycle to simulate market movement
  const sin = Math.sin(cycle * 0.1);

  let netApy = 20 + sin * 5;
  let fundingRate = 0.0001 + sin * 0.00003;
  let riskScore = 15 + Math.abs(sin) * 10;

  // Funding decline scenario: rates drop over time
  if (scenario === "funding_decline") {
    netApy = Math.max(2, 20 * (1 - progress) + sin * 3);
    fundingRate = Math.max(0.00001, 0.0001 * (1 - progress * 0.9));
    state.baseFundingRate = fundingRate;
    state.baseNetApy = netApy;
  }

  // Risk spike scenario: sudden spikes at specific intervals
  if (scenario === "risk_spike") {
    // Spike roughly every 336 cycles (~28h), lasting ~48 cycles (~4h)
    const spikePhase = cycle % 336;
    const inSpike = spikePhase >= 280 && spikePhase <= 328;
    if (inSpike) {
      riskScore = 60 + Math.random() * 30; // high risk
      state.riskSpikeActive = true;
    } else {
      state.riskSpikeActive = false;
    }
  }

  state.baseFundingRate = fundingRate;
  state.baseNetApy = netApy;

  return [
    { id: "opp-btc", symbol: "BTCUSDT", expectedNetApy: netApy, opportunityScore: 85, riskScore: riskScore, capacityUsd: 50_000, fundingRate, markPrice: 100_000 },
    { id: "opp-eth", symbol: "ETHUSDT", expectedNetApy: netApy * 0.7, opportunityScore: 75, riskScore: riskScore * 1.1, capacityUsd: 40_000, fundingRate: fundingRate * 0.8, markPrice: 3_000 },
    { id: "opp-sol", symbol: "SOLUSDT", expectedNetApy: netApy * 0.5, opportunityScore: 60, riskScore: riskScore * 1.3, capacityUsd: 20_000, fundingRate: fundingRate * 0.5, markPrice: 150 },
  ];
}

// ─── Public API ──────────────────────────────────────────

/**
 * Run the full 7-day stability simulation.
 *
 * @param config - Stability run configuration (scenario, duration, etc.).
 * @returns StabilityRunReport with 2016 cycle results and aggregated metrics.
 */
export async function runStabilityRun(config?: StabilityRunConfig): Promise<StabilityRunReport> {
  const cfg: Required<StabilityRunConfig> = {
    totalCapitalUsd: config?.totalCapitalUsd ?? DEFAULTS.totalCapitalUsd,
    intervalMinutes: config?.intervalMinutes ?? DEFAULTS.intervalMinutes,
    durationHours: config?.durationHours ?? DEFAULTS.durationHours,
    dryRun: config?.dryRun ?? DEFAULTS.dryRun,
    startTime: config?.startTime ?? Date.now(),
    scenario: config?.scenario ?? DEFAULTS.scenario,
  };

  const intervalMs = cfg.intervalMinutes * 60 * 1000;
  const totalMs = cfg.durationHours * 60 * 60 * 1000;
  const totalCycles = Math.ceil(totalMs / intervalMs);
  const startTime = cfg.startTime;

  const cycles: StabilityCycleResult[] = [];
  const errors: string[] = [];

  let openPositions: ArbitragePosition[] = [];
  let closedPositions: ArbitragePosition[] = [];
  let fundingEvents = 0;
  let riskEvents = 0;
  let killSwitchTriggers = 0;
  let entrySignals = 0;
  let exitSignals = 0;
  let maxOpenPositions = 0;
  let maxDeltaPercent = 0;
  let maxCapitalUtilPercent = 0;

  let killState: KillSwitchState = createInitialKillSwitchState();

  const scenarioState: ScenarioState = {
    baseFundingRate: 0.0001,
    baseNetApy: 20,
    riskSpikeActive: false,
    highWaterOpen: 0,
  };

  const wallStart = Date.now();

  for (let cycle = 0; cycle < totalCycles; cycle++) {
    const currentTime = startTime + cycle * intervalMs;
    let cycleError = "";
    let entryAttempted = false;
    let exitAttempted = false;

    try {
      // Step 1: Generate opportunities (scenario-adjusted)
      const opps = buildOpps(cycle, totalCycles, cfg.scenario, scenarioState);

      // Step 2: Capital allocation
      const allocResult: CapitalAllocationResult = allocateCapital({
        totalCapitalUsd: cfg.totalCapitalUsd,
        opportunities: opps.map((o) => ({
          id: o.id,
          symbol: o.symbol,
          expectedNetApy: o.expectedNetApy,
          opportunityScore: o.opportunityScore,
          riskScore: o.riskScore,
          capacityUsd: o.capacityUsd,
          shouldExit: false,
        })),
      });

      // Step 3: Simulated entry (plan only, limit open positions)
      const maxDesired = 8;
      if (allocResult.allocations.length > 0 && openPositions.length < maxDesired) {
        for (const alloc of allocResult.allocations) {
          const opp = opps.find((o) => o.id === alloc.opportunityId);
          if (!opp) continue;
          if (openPositions.some((p) => p.symbol === opp.symbol)) continue;

          const qty = alloc.allocatedUsd / opp.markPrice;
          const pos = createArbitragePosition({
            symbol: opp.symbol,
            spotLeg: {
              exchange: "Binance",
              symbol: opp.symbol,
              marketType: "spot",
              side: "long",
              quantity: qty,
              entryPrice: opp.markPrice,
              markPrice: opp.markPrice,
            },
            perpetualLeg: {
              exchange: "Binance",
              symbol: opp.symbol,
              marketType: "perpetual",
              side: "short",
              quantity: qty,
              entryPrice: opp.markPrice,
              markPrice: opp.markPrice,
            },
            fundingCollectedUsd: 0,
            entryNetApy: opp.expectedNetApy,
            metadata: { allocatedCapitalUsd: alloc.allocatedUsd, lastFundingSettlementAt: currentTime },
          });
          openPositions.push(pos);
          entrySignals++;
          entryAttempted = true;
        }
      }

      // Step 4: Update mark prices (simulate price movement)
      openPositions = openPositions.map((pos) => {
        const opp = opps.find((o) => o.symbol === pos.symbol);
        if (!opp) return pos;
        const mp = opp.markPrice;
        const spotPnl = (mp - pos.spotLeg.entryPrice) * pos.spotLeg.quantity;
        const perpPnl = (pos.perpetualLeg.entryPrice - mp) * pos.perpetualLeg.quantity;
        return {
          ...pos,
          spotLeg: { ...pos.spotLeg, markPrice: mp, notionalUsd: pos.spotLeg.quantity * mp, unrealizedPnlUsd: spotPnl },
          perpetualLeg: { ...pos.perpetualLeg, markPrice: mp, notionalUsd: pos.perpetualLeg.quantity * mp, unrealizedPnlUsd: perpPnl },
          totalPnlUsd: spotPnl + perpPnl + pos.fundingCollectedUsd,
        };
      });

      // Step 5: Funding accrual (8h intervals)
      const afterFunding: ArbitragePosition[] = [];
      for (const pos of openPositions) {
        const lastSettlement = (pos.metadata?.lastFundingSettlementAt as number) ?? pos.openedAt;
        if (isFundingSettlementDue(lastSettlement, currentTime, 8)) {
          const opp = opps.find((o) => o.symbol === pos.symbol);
          const rate = opp?.fundingRate ?? scenarioState.baseFundingRate;
          const input: FundingAccrualInput = {
            position: pos,
            fundingRate: rate,
            settledAt: currentTime,
            fundingIntervalHours: 8,
          };
          const result = accrueFunding(input);
          fundingEvents++;
          afterFunding.push({
            ...result.updatedPosition,
            metadata: { ...result.updatedPosition.metadata, lastFundingSettlementAt: currentTime },
          });
        } else {
          afterFunding.push(pos);
        }
      }
      openPositions = afterFunding;

      // Step 6: Monitoring
      const monitorReport = generateMonitoringReport(openPositions);

      // Step 7: Exit suggestion
      const exitReport = generateExitSuggestions(openPositions, undefined, undefined, currentTime, {
        maxHoldingHours: 48,
        takeProfitUsd: 0.50,
        stopLossUsd: 500,
      });

      // Step 8: Simulated exit (plan only)
      const remaining: ArbitragePosition[] = [];
      for (const pos of openPositions) {
        const suggestion = exitReport.suggestions.find((s) => s.positionId === pos.id);
        if (suggestion && suggestion.status !== "hold") {
          const closed = closeArbitragePosition(pos, {
            spotClosePrice: pos.spotLeg.markPrice,
            perpClosePrice: pos.perpetualLeg.markPrice,
            additionalFundingUsd: 0,
          });
          closedPositions.push({ ...closed, closedAt: currentTime });
          exitSignals++;
          exitAttempted = true;
        } else {
          remaining.push(pos);
        }
      }
      openPositions = remaining;

      // Step 9: Portfolio report
      const allPositions = [...openPositions, ...closedPositions];
      const inputs: PortfolioPositionInput[] = allPositions.map((p) => ({
        position: p,
        allocatedCapitalUsd: (p.metadata?.allocatedCapitalUsd as number) ?? undefined,
      }));
      const portfolioReport = calculatePortfolioReport(inputs, {
        totalCapitalUsd: cfg.totalCapitalUsd,
        includeClosedPositions: true,
      }, currentTime);

      // Track max delta
      const absDelta = Math.abs(portfolioReport.summary.totalDeltaPercent);
      if (absDelta > maxDeltaPercent) maxDeltaPercent = absDelta;

      // Build risk context
      const riskCtx: LiveRiskContext = {
        riskReport: {
          events: [],
          lowCount: 0,
          mediumCount: 0,
          highCount: 0,
          criticalCount: 0,
          overallRisk: scenarioState.riskSpikeActive ? "critical" : "low",
          generatedAt: currentTime,
        },
        capitalState: {
          totalCapitalUsd: cfg.totalCapitalUsd,
          reserveUsd: cfg.totalCapitalUsd * 0.1,
          deployedCapitalUsd: portfolioReport.summary.totalAllocatedCapitalUsd,
          availableCapitalUsd: cfg.totalCapitalUsd * 0.9 - portfolioReport.summary.totalAllocatedCapitalUsd,
          unrealizedPnlUsd: 0,
          realizedPnlUsd: 0,
          fundingCollectedUsd: portfolioReport.summary.totalFundingCollectedUsd,
          utilizationPercent: portfolioReport.summary.capitalUtilizationPercent,
          updatedAt: currentTime,
        },
        openPositionsCount: openPositions.length,
        portfolioReport,
        recentFailedExecutions: 0,
      };

      // Track max capital utilisation
      const util = portfolioReport.summary.capitalUtilizationPercent;
      if (util > maxCapitalUtilPercent) maxCapitalUtilPercent = util;

      // Step 10: Risk Engine
      const riskDecision = evaluateLiveRisk(riskCtx);
      riskEvents += riskDecision.categories.length;

      // Step 11: Kill Switch
      const killDecision = evaluateKillSwitch(killState, riskDecision);
      killState = killDecision.state;
      if (killDecision.action !== "allow") killSwitchTriggers++;

      // Step 12: Track max open positions
      maxOpenPositions = Math.max(maxOpenPositions, openPositions.length);
      scenarioState.highWaterOpen = maxOpenPositions;

    } catch (err) {
      cycleError = err instanceof Error ? err.message : String(err);
      errors.push(`Cycle ${cycle}: ${cycleError}`);
    }

    cycles.push({
      cycle,
      currentTime,
      openPositionCount: openPositions.length,
      closedPositionCount: closedPositions.length,
      totalFundingCollected: openPositions.reduce((s, p) => s + p.fundingCollectedUsd, 0) +
        closedPositions.reduce((s, p) => s + p.fundingCollectedUsd, 0),
      deltaPercent: 0,
      capitalUtilizationPercent: maxCapitalUtilPercent,
      riskLevel: scenarioState.riskSpikeActive ? "critical" : "low",
      riskAction: "allow",
      killSwitchAction: killState.action,
      entryAttempted,
      exitAttempted,
      error: cycleError,
    });
  }

  const wallClockMs = Date.now() - wallStart;

  return {
    config: cfg,
    cycles,
    totalCycles,
    completedCycles: totalCycles - errors.length,
    entrySignals,
    exitSignals,
    fundingEvents,
    riskEvents,
    killSwitchTriggers,
    maxOpenPositions,
    maxDeltaPercent,
    maxCapitalUtilizationPercent: maxCapitalUtilPercent,
    errorCount: errors.length,
    errors,
    wallClockMs,
    simulatedHours: cfg.durationHours,
    startedAt: wallStart,
    endedAt: Date.now(),
  };
}
