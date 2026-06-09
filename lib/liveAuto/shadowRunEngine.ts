/**
 * Shadow Run Engine — 24h Stability Validation
 *
 * Simulates the complete arbitrage lifecycle over 24 hours (288 cycles at 5-min intervals).
 * All operations run in dry-run / plan-only mode — no real orders are executed.
 *
 * Per-cycle steps:
 *   1.  Simulate opportunity arrival
 *   2.  Opportunity ranking (simplified)
 *   3.  Net profit estimation
 *   4.  Capital allocation
 *   5.  Auto Entry (plan only)
 *   6.  Funding accrual
 *   7.  Monitoring
 *   8.  Exit suggestion
 *   9.  Auto Exit (plan only)
 *   10. Portfolio report
 *   11. Risk Engine
 *   12. Kill Switch
 */

import type { ArbitragePosition } from "../arbitrage/arbitragePositionTypes";
import { createArbitragePosition } from "../arbitrage/arbitragePositionEngine";
import { allocateCapital } from "../arbitrage/capitalAllocationEngine";
import type { CapitalAllocationResult } from "../arbitrage/capitalAllocationTypes";
import { accrueFunding, isFundingSettlementDue } from "../arbitrage/fundingAccrualEngine";
import type { FundingAccrualInput } from "../arbitrage/fundingAccrualTypes";
import { closeArbitragePosition } from "../arbitrage/arbitragePositionEngine";
import { generateMonitoringReport } from "../semiAuto/autoMonitoringEngine";
import { generateExitSuggestions } from "../semiAuto/exitSuggestionEngine";
import { calculatePortfolioReport } from "../arbitrage/portfolioEngine";
import type { PortfolioPositionInput } from "../arbitrage/portfolioTypes";
import { evaluateLiveRisk } from "./riskEngine";
import type { LiveRiskContext, LiveRiskEngineConfig } from "./riskEngineTypes";
import { evaluateKillSwitch, canExecuteAction, createInitialKillSwitchState } from "./killSwitchEngine";
import type { KillSwitchState } from "./killSwitchTypes";
import type {
  ShadowRunConfig,
  ShadowRunCycleResult,
  ShadowRunReport,
} from "./shadowRunTypes";

// ─── Defaults ────────────────────────────────────────────

const DEFAULT_INTERVAL_MINUTES = 5;
const DEFAULT_DURATION_HOURS = 24;
const DEFAULT_TOTAL_CAPITAL = 100_000;

// ─── Simulated opportunities ─────────────────────────────

interface SimulatedOpp {
  id: string;
  symbol: string;
  exchange: string;
  expectedNetApy: number;
  opportunityScore: number;
  riskScore: number;
  capacityUsd: number;
  fundingRate: number;
  markPrice: number;
}

const OPPORTUNITIES: SimulatedOpp[] = [
  { id: "opp-btc", symbol: "BTCUSDT", exchange: "binance", expectedNetApy: 25, opportunityScore: 85, riskScore: 15, capacityUsd: 50_000, fundingRate: 0.0001, markPrice: 100_000 },
  { id: "opp-eth", symbol: "ETHUSDT", exchange: "binance", expectedNetApy: 18, opportunityScore: 78, riskScore: 20, capacityUsd: 40_000, fundingRate: 0.00008, markPrice: 3_000 },
  { id: "opp-sol", symbol: "SOLUSDT", exchange: "binance", expectedNetApy: 12, opportunityScore: 65, riskScore: 30, capacityUsd: 20_000, fundingRate: 0.00005, markPrice: 150 },
];

// ─── Helpers ─────────────────────────────────────────────

function resolveConfig(c?: ShadowRunConfig): Required<ShadowRunConfig> {
  return {
    totalCapitalUsd: c?.totalCapitalUsd ?? DEFAULT_TOTAL_CAPITAL,
    intervalMinutes: c?.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES,
    durationHours: c?.durationHours ?? DEFAULT_DURATION_HOURS,
    enableSafetyChecks: c?.enableSafetyChecks ?? true,
    dryRun: c?.dryRun ?? true,
    startTime: c?.startTime ?? Date.now(),
  };
}

function pickOpportunity(cycle: number, config: Required<ShadowRunConfig>): SimulatedOpp[] {
  // Rotate through opportunities with varying netApy to simulate market changes
  const phase = Math.floor(cycle / 48) % 6; // change every 4h
  return OPPORTUNITIES.map((opp, i) => {
    const netApyMod = Math.sin((cycle + i * 24) * 0.1) * 5; // sinusoidal variation
    return {
      ...opp,
      expectedNetApy: Math.max(2, opp.expectedNetApy + netApyMod),
      fundingRate: Math.max(0.00001, opp.fundingRate + netApyMod * 0.000005),
    };
  });
}

// ─── Public API ──────────────────────────────────────────

/**
 * Run the full shadow simulation for the configured duration.
 *
 * @param config - Shadow run configuration.
 * @returns A ShadowRunReport with all cycle results and aggregated metrics.
 */
export async function runShadowRun(config?: ShadowRunConfig): Promise<ShadowRunReport> {
  const cfg = resolveConfig(config);
  const intervalMs = cfg.intervalMinutes * 60 * 1000;
  const totalMs = cfg.durationHours * 60 * 60 * 1000;
  const totalCycles = Math.ceil(totalMs / intervalMs);
  const startTime = cfg.startTime;

  const cycles: ShadowRunCycleResult[] = [];

  let openPositions: ArbitragePosition[] = [];
  let closedPositions: ArbitragePosition[] = [];
  let fundingEventsCount = 0;
  let riskEventCount = 0;
  let killSwitchTriggerCount = 0;
  let entrySignalCount = 0;
  let exitSignalCount = 0;
  let errorCount = 0;
  let maxOpenPositions = 0;

  // Kill switch persistent state
  let killState: KillSwitchState = createInitialKillSwitchState();

  const wallStart = Date.now();

  for (let cycle = 0; cycle < totalCycles; cycle++) {
    const currentTime = startTime + cycle * intervalMs;
    let cycleError = "";
    let entryAttempted = false;
    let exitAttempted = false;

    try {
      // ── Simulate opportunity arrival ──────────────
      const opps = pickOpportunity(cycle, cfg);

      // ── Build capital allocation ──────────────────
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

      // ── Auto Entry (plan only) ────────────────────
      if (allocResult.allocations.length > 0 && openPositions.length < 10) {
        for (const alloc of allocResult.allocations) {
          const opp = opps.find((o) => o.id === alloc.opportunityId);
          if (!opp) continue;
          const alreadyOpen = openPositions.some((p) => p.symbol === opp.symbol);
          if (alreadyOpen) continue;

          const qty = alloc.allocatedUsd / opp.markPrice;
          const pos = createArbitragePosition({
            symbol: opp.symbol,
            spotLeg: {
              exchange: opp.exchange as any,
              symbol: opp.symbol,
              marketType: "spot",
              side: "long",
              quantity: qty,
              entryPrice: opp.markPrice,
              markPrice: opp.markPrice,
            },
            perpetualLeg: {
              exchange: opp.exchange as any,
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
          entrySignalCount++;
          entryAttempted = true;
        }
      }

      // ── Update mark prices ────────────────────────
      openPositions = openPositions.map((pos) => {
        const opp = opps.find((o) => o.symbol === pos.symbol);
        if (!opp) return pos;
        const sp = opp.markPrice;
        const spotPnl = (sp - pos.spotLeg.entryPrice) * pos.spotLeg.quantity;
        const perpPnl = (pos.perpetualLeg.entryPrice - sp) * pos.perpetualLeg.quantity;
        return {
          ...pos,
          spotLeg: { ...pos.spotLeg, markPrice: sp, notionalUsd: pos.spotLeg.quantity * sp, unrealizedPnlUsd: spotPnl },
          perpetualLeg: { ...pos.perpetualLeg, markPrice: sp, notionalUsd: pos.perpetualLeg.quantity * sp, unrealizedPnlUsd: perpPnl },
          totalPnlUsd: spotPnl + perpPnl + pos.fundingCollectedUsd,
        };
      });

      // ── Funding Accrual ────────────────────────────
      const afterFunding: ArbitragePosition[] = [];
      for (const pos of openPositions) {
        const lastSettlement = (pos.metadata?.lastFundingSettlementAt as number) ?? pos.openedAt;
        if (isFundingSettlementDue(lastSettlement, currentTime, 8)) {
          const opp = opps.find((o) => o.symbol === pos.symbol);
          const rate = opp?.fundingRate ?? 0.0001;
          const input: FundingAccrualInput = {
            position: pos,
            fundingRate: rate,
            settledAt: currentTime,
            fundingIntervalHours: 8,
          };
          const result = accrueFunding(input);
          fundingEventsCount++;
          afterFunding.push({
            ...result.updatedPosition,
            metadata: { ...result.updatedPosition.metadata, lastFundingSettlementAt: currentTime },
          });
        } else {
          afterFunding.push(pos);
        }
      }
      openPositions = afterFunding;

      // ── Monitoring ──────────────────────────────
      const monitorReport = generateMonitoringReport(openPositions);

      // ── Exit Suggestion ────────────────────────────
      const exitReport = generateExitSuggestions(openPositions, undefined, undefined, currentTime, {
        maxHoldingHours: 48,
        takeProfitUsd: 0.50,
        stopLossUsd: 500,
      });

      // ── Auto Exit (plan only) ─────────────────────
      const remaining: ArbitragePosition[] = [];
      for (const pos of openPositions) {
        const suggestion = exitReport.suggestions.find((s) => s.positionId === pos.id);
        if (suggestion && suggestion.status !== "hold") {
          // Close the position (plan only — same price)
          const closed = closeArbitragePosition(pos, {
            spotClosePrice: pos.spotLeg.markPrice,
            perpClosePrice: pos.perpetualLeg.markPrice,
            additionalFundingUsd: 0,
          });
          closedPositions.push({ ...closed, closedAt: currentTime });
          exitSignalCount++;
          exitAttempted = true;
        } else {
          remaining.push(pos);
        }
      }
      openPositions = remaining;

      // ── Portfolio Report ───────────────────────────
      const allPositions = [...openPositions, ...closedPositions];
      const inputs: PortfolioPositionInput[] = allPositions.map((p) => ({
        position: p,
        allocatedCapitalUsd: (p.metadata?.allocatedCapitalUsd as number) ?? undefined,
      }));
      const portfolioReport = calculatePortfolioReport(inputs, {
        totalCapitalUsd: cfg.totalCapitalUsd,
        includeClosedPositions: true,
      }, currentTime);

      // ── Risk Engine ─────────────────────────────
      const riskCtx: LiveRiskContext = {
        riskReport: { events: monitorReport.positions.flatMap((p) => p.metrics.map((m) => ({
          id: `${p.positionId}-${m.name}`,
          category: "portfolio" as any,
          severity: m.status === "danger" ? "high" as any : m.status === "warning" ? "medium" as any : "low" as any,
          title: `${m.name}: ${m.message ?? ""}`,
          message: m.message ?? "",
          createdAt: currentTime,
        }))),
          lowCount: 0, mediumCount: 0, highCount: 0, criticalCount: 0, overallRisk: "low", generatedAt: currentTime,
        },
        openPositionsCount: openPositions.length,
        portfolioReport,
      };

      const riskDecision = evaluateLiveRisk(riskCtx);
      riskEventCount += riskDecision.categories.length;

      // ── Kill Switch ─────────────────────────────
      const killDecision = evaluateKillSwitch(killState, riskDecision);
      killState = killDecision.state;
      if (killDecision.action !== "allow") killSwitchTriggerCount++;

      // ── Track max open positions ────────────────
      maxOpenPositions = Math.max(maxOpenPositions, openPositions.length);
    } catch (err) {
      cycleError = err instanceof Error ? err.message : String(err);
      errorCount++;
    }

    // ── Record cycle result ──────────────────────────
    cycles.push({
      cycle,
      currentTime,
      openPositionCount: openPositions.length,
      closedPositionCount: closedPositions.length,
      totalFundingCollected: openPositions.reduce((s, p) => s + p.fundingCollectedUsd, 0) +
        closedPositions.reduce((s, p) => s + p.fundingCollectedUsd, 0),
      riskLevel: "low",
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
    simulatedHours: cfg.durationHours,
    entrySignalCount,
    exitSignalCount,
    fundingEventCount: fundingEventsCount,
    riskEventCount,
    killSwitchTriggerCount,
    maxOpenPositions,
    closedPositionCount: closedPositions.length,
    errorCount,
    wallClockMs,
  };
}
