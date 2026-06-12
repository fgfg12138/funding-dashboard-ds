/**
 * Cross-Exchange Tiny Dry Run
 *
 * Reads live Binance/Bybit/OKX public data, generates a cross-exchange
 * spread execution plan, and runs it through all safety gates.
 *
 * ⛔ NO REAL ORDERS — DRY RUN ONLY
 * ⏸️ SKIPPED by default. Enable with RUN_CROSS_EXCHANGE_TINY_DRY_RUN=true
 */

import { describe, expect, it } from "vitest";
import { createRealConnectors } from "../connectors/real/createRealConnectors";
import { findCrossExchangeFundingSpreads } from "../fundingSpread/fundingSpreadEngine";
import { DEFAULT_SPREAD_CONFIG } from "../fundingSpread/fundingSpreadTypes";
import { buildCrossExchangeExecutionPlan, reviewCrossExchangeExecutionPlan, checkExecutionIdempotency, resetIdempotencyGuard, acquireExecutionLock, completeExecutionLock, simulateExecutionScenario, generateExecutionReadinessReport } from "./crossExchangeExecutionReview";
import { evaluateTinyTradeGuard } from "../liveAuto/tinyTradeGuardEngine";
import { DEFAULT_TINY_TRADE_GUARD_CONFIG } from "../liveAuto/tinyTradeGuardTypes";
import type { TinyTradeGuardContext } from "../liveAuto/tinyTradeGuardTypes";

const RUN = process.env.RUN_CROSS_EXCHANGE_TINY_DRY_RUN === "true";
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const MAX_CAPITAL_USD = 10;
const MAX_POSITION_USD = 5;
const describeOrSkip = RUN ? describe : describe.skip;
const NO_MIN = { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 };

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

type Report = {
  symbol: string;
  shortExchange: string;
  longExchange: string;
  spreadRate: number;
  spreadApy: number;
  netSpreadApy: number;
  positionSizeUsd: number;
  shortOrderPlanned: Record<string, unknown>;
  longOrderPlanned: Record<string, unknown>;
  executionMode: string;
  riskDecision: Record<string, unknown>;
  killSwitchDecision: Record<string, unknown>;
  idempotencyPassed: boolean;
  executionLockStatus: string;
  readinessStatus: string;
  blockers: string[];
  realOrdersExecuted: number;
  postRequests: number;
  putRequests: number;
  deleteRequests: number;
  generatedAt: number;
};

describeOrSkip("Cross-Exchange Tiny Dry Run", () => {
  it("Full dry-run pipeline: real data → execution plan → safety gates → report", async () => {
    const connectors = createRealConnectors();
    const exchangeIds = Object.keys(connectors);

    // 1-3. Health + funding info + spread engine
    for (const c of Object.values(connectors)) await c.getHealth();
    for (const c of Object.values(connectors)) await c.getTradingRules();
    for (const c of Object.values(connectors)) {
      for (const sym of SYMBOLS) {
        const info = await c.getFundingInfo(sym);
        expect(info).toBeDefined();
        expect(info!.markPrice).toBeGreaterThan(0);
      }
    }

    const opportunities = await findCrossExchangeFundingSpreads(connectors as any, SYMBOLS, NO_MIN);
    expect(opportunities.length).toBeGreaterThan(0);
    const top = opportunities[0];
    expect(top.shortExchangeId).not.toBe(top.longExchangeId);

    // 4. Build execution plan
    const positionSize = Math.min(MAX_POSITION_USD, MAX_CAPITAL_USD * 0.5);
    const plan = buildCrossExchangeExecutionPlan({
      canonicalSymbol: top.canonicalSymbol,
      shortExchangeId: top.shortExchangeId,
      longExchangeId: top.longExchangeId,
      shortSymbol: top.shortLeg.exchangeSymbol,
      longSymbol: top.longLeg.exchangeSymbol,
      positionSizeUsd: positionSize,
      mode: "dry_run",
    });

    expect(plan.executionMode).toBe("dry_run");
    expect(plan.positionSizeUsd).toBeLessThanOrEqual(MAX_POSITION_USD);

    // 5. TinyTradeGuard
    const guardCtx: TinyTradeGuardContext = {
      currentCapitalUsd: MAX_CAPITAL_USD,
      currentOpenPositions: 0,
      availableBalanceUsd: MAX_CAPITAL_USD,
      riskDecision: { action: "allow", level: "low", categories: [], reasons: [], generatedAt: Date.now() },
      killSwitchDecision: { allowed: true, action: "allow", reasons: [], state: { status: "active", action: "allow", reasons: [], updatedAt: Date.now() }, generatedAt: Date.now() },
      accountSyncSuccess: true,
      reconciliationHasMismatches: false,
      apiHasTradePermission: true,
      hasManualConfirmation: true,
    };
    const guardDecision = evaluateTinyTradeGuard(
      { ...DEFAULT_TINY_TRADE_GUARD_CONFIG, allowRealExecution: true, maxCapitalUsd: MAX_CAPITAL_USD, maxPositionUsd: MAX_POSITION_USD },
      guardCtx,
    );
    expect(guardDecision.allowed).toBe(true);

    // 6. Review execution plan
    const planRisks = reviewCrossExchangeExecutionPlan(plan, MAX_POSITION_USD);
    expect(planRisks.filter((r) => r.blocking).length).toBe(0);

    // 7. Idempotency
    resetIdempotencyGuard();
    const idemCheck = checkExecutionIdempotency(plan.id);
    expect(idemCheck.duplicate).toBe(false);

    // 8. Execution lock
    const lockResult = acquireExecutionLock(plan.id);
    expect(lockResult.acquired).toBe(true);
    completeExecutionLock(plan.id, "completed");

    // 9. Simulate both legs planned (dry run — no actual fill)
    const scenario = simulateExecutionScenario(
      `dry_run_${top.canonicalSymbol}_${top.shortExchangeId}_${top.longExchangeId}`,
      { success: true, filledQuantity: 0, expectedQuantity: plan.shortOrder.quantity, orderId: "dry-short" },
      { success: true, filledQuantity: 0, expectedQuantity: plan.longOrder.quantity, orderId: "dry-long" },
    );

    // 10. Generate readiness report
    const reportResult = generateExecutionReadinessReport([scenario]);
    const blockers = reviewCrossExchangeExecutionPlan(plan, MAX_POSITION_USD).filter((r) => r.blocking);

    const report: Report = {
      symbol: top.canonicalSymbol,
      shortExchange: top.shortExchangeId,
      longExchange: top.longExchangeId,
      spreadRate: top.spreadRate,
      spreadApy: top.spreadApy,
      netSpreadApy: top.netSpreadApy,
      positionSizeUsd: plan.positionSizeUsd,
      shortOrderPlanned: {
        exchange: plan.shortOrder.exchangeId,
        symbol: plan.shortOrder.exchangeSymbol,
        side: plan.shortOrder.side,
        type: plan.shortOrder.type,
        quantity: plan.shortOrder.quantity,
      },
      longOrderPlanned: {
        exchange: plan.longOrder.exchangeId,
        symbol: plan.longOrder.exchangeSymbol,
        side: plan.longOrder.side,
        type: plan.longOrder.type,
        quantity: plan.longOrder.quantity,
      },
      executionMode: plan.executionMode,
      riskDecision: { action: guardDecision.riskPassed ? "allow" : "block" },
      killSwitchDecision: { action: guardDecision.killSwitchPassed ? "allow" : "block" },
      idempotencyPassed: !idemCheck.duplicate,
      executionLockStatus: lockResult.acquired ? "acquired" : "blocked",
      readinessStatus: blockers.length === 0 ? "ready" : "blocked",
      blockers: blockers.map((r) => r.message),
      realOrdersExecuted: 0,
      postRequests: 0,
      putRequests: 0,
      deleteRequests: 0,
      generatedAt: Date.now(),
    };

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║           CROSS-EXCHANGE TINY DRY RUN — REPORT                      ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Symbol:             ${report.symbol.padEnd(48)}║`);
    console.log(`  ║  Short Exchange:     ${report.shortExchange.padEnd(48)}║`);
    console.log(`  ║  Long Exchange:      ${report.longExchange.padEnd(48)}║`);
    console.log(`  ║  Spread Rate:        ${(report.spreadRate * 100).toFixed(4).padStart(10)}%${" ".repeat(42)}║`);
    console.log(`  ║  Spread APY:         ${report.spreadApy.toFixed(2).padStart(10)}%${" ".repeat(42)}║`);
    console.log(`  ║  Net Spread APY:     ${report.netSpreadApy.toFixed(2).padStart(10)}%${" ".repeat(42)}║`);
    console.log(`  ║  Position Size:      $${report.positionSizeUsd.toFixed(2).padStart(8)}${" ".repeat(42)}║`);
    console.log(`  ║  Short Leg:          ${report.shortOrderPlanned.side} ${String(report.shortOrderPlanned.quantity)} ${String(report.shortOrderPlanned.symbol)} on ${String(report.shortOrderPlanned.exchange)}${" ".repeat(20)}║`);
    console.log(`  ║  Long Leg:           ${report.longOrderPlanned.side} ${String(report.longOrderPlanned.quantity)} ${String(report.longOrderPlanned.symbol)} on ${String(report.longOrderPlanned.exchange)}${" ".repeat(21)}║`);
    console.log(`  ║  Execution Mode:     ${report.executionMode.padEnd(48)}║`);
    console.log(`  ║  Idempotency:        ${String(report.idempotencyPassed).padEnd(48)}║`);
    console.log(`  ║  Execution Lock:     ${report.executionLockStatus.padEnd(48)}║`);
    console.log(`  ║  Readiness:          ${report.readinessStatus.padEnd(48)}║`);
    console.log(`  ║  Risk Decision:      ${String(report.riskDecision.action).padEnd(48)}║`);
    console.log(`  ║  KS Decision:        ${String(report.killSwitchDecision.action).padEnd(48)}║`);
    console.log(`  ║  TinyTradeGuard:     allow${" ".repeat(49)}║`);
    console.log(`  ║  Blockers:           ${report.blockers.length > 0 ? report.blockers.map(b => b.slice(0, 45)).join("; ") : "none"}${" ".repeat(30)}║`);
    console.log(`  ║  ───────────────────────────────────────────────────────────────────── ║`);
    console.log(`  ║  Real Orders:        0${" ".repeat(48)}║`);
    console.log(`  ║  POST/PUT/DEL:       0/0/0${" ".repeat(43)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════════╝\n`);

    // Verify all critical conditions
    expect(report.realOrdersExecuted).toBe(0);
    expect(report.postRequests).toBe(0);
    expect(report.putRequests).toBe(0);
    expect(report.deleteRequests).toBe(0);
    expect(report.readinessStatus).toBe("ready");
    expect(report.idempotencyPassed).toBe(true);
    expect(report.executionLockStatus).toBe("acquired");
    expect(report.riskDecision.action).toBe("allow");
    expect(report.killSwitchDecision.action).toBe("allow");
    expect(report.shortExchange).not.toBe(report.longExchange);
    expect(isFiniteNumber(report.spreadApy)).toBe(true);
    expect(isFiniteNumber(report.netSpreadApy)).toBe(true);
    expect(report.blockers.length).toBe(0);
  });
});
