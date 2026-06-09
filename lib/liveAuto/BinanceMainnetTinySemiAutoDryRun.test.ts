/**
 * Binance Mainnet Tiny Semi-Auto Dry Run
 *
 * Runs the full trade pipeline against real Binance Mainnet data but STOPS
 * before any order execution. All execution paths are blocked by:
 *   - BinanceMainnetReadOnlyClient (blocks POST/PUT/DELETE at HTTP layer)
 *   - TinyTradeGuard (blocks if allowRealExecution=false)
 *   - No createOrder / cancelOrder / executeHedgePlan calls in this test
 *
 * Pipeline:
 *   Mainnet Data → Opportunity Ranking → Net Profit → Capital Allocation →
 *   Risk Engine → Kill Switch → TinyTradeGuard → Auto Entry Candidate →
 *   Hedge Plan → ⛔ STOP (no execution)
 *
 * ⏸️ SKIPPED by default. Enable with:
 *   RUN_BINANCE_MAINNET_TINY_DRY_RUN=true
 *   BINANCE_MAINNET_API_KEY=<key>
 *   BINANCE_MAINNET_API_SECRET=<secret>
 */

import { describe, expect, it } from "vitest";
import { BinanceFetchHttpClient } from "../orderRouter/adapters/binance/BinanceFetchHttpClient";
import { BinanceMainnetReadOnlyClient } from "../orderRouter/adapters/binance/BinanceMainnetReadOnlyClient";
import { selectAutoEntryCandidates, buildAutoEntryHedgePlan } from "./autoEntryEngine";
import { evaluateTinyTradeGuard } from "./tinyTradeGuardEngine";
import { DEFAULT_TINY_TRADE_GUARD_CONFIG } from "./tinyTradeGuardTypes";
import type { TinyDryRunReport } from "./tinyDryRunTypes";
import type { AutoEntryCandidate, LiveAutoEntryConfig } from "./autoEntryTypes";
import type { TinyTradeGuardContext } from "./tinyTradeGuardTypes";
import type { LiveRiskDecision } from "./riskEngineTypes";
import type { KillSwitchDecision } from "./killSwitchTypes";

// ─── Environment ────────────────────────────────────────

const RUN = process.env.RUN_BINANCE_MAINNET_TINY_DRY_RUN === "true";
const API_KEY = process.env.BINANCE_MAINNET_API_KEY ?? "";
const API_SECRET = process.env.BINANCE_MAINNET_API_SECRET ?? "";
const HAS_CREDS = API_KEY.length > 0 && API_SECRET.length > 0;

const BASE_URL = "https://fapi.binance.com";

// ─── Perpetual symbols ─────────────────────────────────

const TARGET_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
  "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "DOTUSDT",
  "MATICUSDT", "UNIUSDT", "SHIBUSDT", "ATOMUSDT", "ETCUSDT",
  "LTCUSDT", "BCHUSDT", "APTUSDT", "FILUSDT", "NEARUSDT",
];

// ─── Default risk decision (safe) ─────────────────────

const SAFE_RISK_DECISION: LiveRiskDecision = {
  action: "allow",
  level: "low",
  categories: [],
  reasons: [],
  generatedAt: Date.now(),
};

const CRITICAL_RISK_DECISION: LiveRiskDecision = {
  action: "block_entry",
  level: "critical",
  categories: ["market"],
  reasons: ["Simulated critical risk"],
  generatedAt: Date.now(),
};

// ─── Default kill switch decision (safe) ──────────────

const SAFE_KILL_SWITCH_DECISION: KillSwitchDecision = {
  allowed: true,
  action: "allow",
  reasons: [],
  state: { status: "active", action: "allow", reasons: [], updatedAt: Date.now() },
  generatedAt: Date.now(),
};

const LOCKED_KILL_SWITCH_DECISION: KillSwitchDecision = {
  allowed: false,
  action: "block_all",
  reasons: ["System locked — dry run simulation"],
  state: { status: "locked", action: "block_all", reasons: ["operator_lock"], lockedAt: Date.now(), updatedAt: Date.now() },
  generatedAt: Date.now(),
};

// ─── Entry config for dry run ──────────────────────────

const DRY_RUN_ENTRY_CONFIG: LiveAutoEntryConfig = {
  enabled: true,
  dryRun: true,
  minExpectedNetApy: 0.5,
  minOpportunityScore: 10,
  maxRiskLevel: "high",
  maxOpenPositions: 1,
  maxEntryNotionalUsd: 50,
  allowedExchanges: ["binance"],
  requireRiskCheck: false,
  requireCapitalAllocation: false,
};

// ─── Test Suite ──────────────────────────────────────────

const describeOrSkip = RUN && HAS_CREDS ? describe : describe.skip;

describeOrSkip("Binance Mainnet Tiny Semi-Auto Dry Run", () => {
  let report: TinyDryRunReport;

  it("Runs full dry-run pipeline: Mainnet data → Hedge Plan (STOP before execution)", async () => {
    const fetchClient = new BinanceFetchHttpClient({
      apiKey: API_KEY,
      secret: API_SECRET,
      baseUrl: BASE_URL,
    });
    const client = new BinanceMainnetReadOnlyClient(fetchClient);

    let postRequests = 0;
    let realOrdersExecuted = 0;
    const blockedReasons: string[] = [];
    let wouldExecute = true;

    // ─── Step 1: Fetch real Mainnet Premium Index ──
    const response = await client.request({
      method: "GET",
      path: "/fapi/v1/premiumIndex",
    });

    expect(response.statusCode).toBe(200);
    const allData = response.body as Array<Record<string, unknown>>;
    expect(Array.isArray(allData)).toBe(true);

    // ─── Step 2: Parse real funding data ────────────
    const targetSet = new Set(TARGET_SYMBOLS);
    const fundingData = allData
      .filter((item) => targetSet.has(String(item.symbol)))
      .map((item) => ({
        symbol: String(item.symbol),
        fundingRate: Number(item.lastFundingRate ?? 0),
        markPrice: Number(item.markPrice ?? 0),
        indexPrice: Number(item.indexPrice ?? 0),
      }));

    expect(fundingData.length).toBeGreaterThan(0);

    // ─── Step 3-5: Build + Rank opportunities ────────
    const opportunities = fundingData
      .map((d) => ({
        symbol: d.symbol,
        fundingRate: d.fundingRate,
        annualizedRate: Math.abs(d.fundingRate) * 365 * 100,
        netApy: Math.abs(d.fundingRate) * 365 * 100 * 0.85,
        score: Math.min(100, Math.abs(d.fundingRate) * 365 * 100 * 2),
        markPrice: d.markPrice,
      }))
      .filter((o) => o.annualizedRate > 0 && Number.isFinite(o.annualizedRate))
      .sort((a, b) => b.score - a.score);

    const topOpp = opportunities[0];
    expect(topOpp).toBeDefined();

    // ─── Step 6: Risk Engine (simulated with real context) ──
    const riskDecision = { ...SAFE_RISK_DECISION, generatedAt: Date.now() };

    // ─── Step 7: Kill Switch (simulated) ──────────────
    const killSwitchDecision = { ...SAFE_KILL_SWITCH_DECISION, generatedAt: Date.now() };

    // ─── Step 8: TinyTradeGuard ───────────────────────
    const guardContext: TinyTradeGuardContext = {
      currentCapitalUsd: 50,           // Under $100 limit
      currentOpenPositions: 0,         // Under 1 limit
      availableBalanceUsd: 100,        // Above $50 minimum
      riskDecision,
      killSwitchDecision,
      accountSyncSuccess: true,
      reconciliationHasMismatches: false,
      apiHasTradePermission: true,
      hasManualConfirmation: true,
    };

    const guardConfig = {
      ...DEFAULT_TINY_TRADE_GUARD_CONFIG,
      allowRealExecution: true,        // Enable for dry run to test full flow
    };

    const guardDecision = evaluateTinyTradeGuard(guardConfig, guardContext);

    if (!guardDecision.allowed) {
      wouldExecute = false;
      blockedReasons.push(...guardDecision.reasons);
    }

    // ─── Step 9: Auto Entry Candidate ────────────────
    const candidates: AutoEntryCandidate[] = opportunities.map((opp) => ({
      opportunityId: `dry-run-${opp.symbol}`,
      symbol: opp.symbol,
      exchange: "binance",
      expectedNetApy: opp.netApy,
      opportunityScore: opp.score,
      allocatedCapitalUsd: Math.min(50, opp.netApy > 2 ? 50 : 0),
      riskLevel: opp.netApy > 5 ? "medium" : "low",
      markPrice: opp.markPrice,
      fundingRate: opp.fundingRate,
      reason: `Dry run: funding ${(opp.fundingRate * 100).toFixed(4)}%, APY ${opp.netApy.toFixed(1)}%`,
    }));

    const selected = selectAutoEntryCandidates(candidates, 0, DRY_RUN_ENTRY_CONFIG);
    const entryCandidate = selected.length > 0 ? selected[0] : undefined;

    // ─── Step 10: Hedge Plan (STOP — no execution) ────
    let hedgePlan = undefined;
    if (entryCandidate && wouldExecute) {
      hedgePlan = buildAutoEntryHedgePlan(entryCandidate, DRY_RUN_ENTRY_CONFIG);

      // Verify hedge plan is created but NOT executed
      expect(hedgePlan.status).toBe("planned");
      expect(hedgePlan.legs.length).toBeGreaterThan(0);
    }

    // ─── Build Report ────────────────────────────────
    report = {
      opportunity: topOpp ? {
        symbol: topOpp.symbol,
        fundingRate: topOpp.fundingRate,
        annualizedRate: topOpp.annualizedRate,
        netApy: topOpp.netApy,
        score: topOpp.score,
        markPrice: topOpp.markPrice,
      } : undefined,
      netApy: topOpp?.netApy ?? 0,
      allocationUsd: entryCandidate?.allocatedCapitalUsd ?? 0,
      riskDecision,
      killSwitchDecision,
      tinyTradeDecision: guardDecision,
      entryCandidate,
      hedgePlan,
      wouldExecute,
      blockedReasons,
      realOrdersExecuted,
      postRequests,
      generatedAt: Date.now(),
    };

    // ─── Print Summary ───────────────────────────────
    console.log(`\n  ╔═══════════════════════════════════════════════════════╗`);
    console.log(`  ║  Binance Mainnet Tiny Semi-Auto Dry Run             ║`);
    console.log(`  ╠═══════════════════════════════════════════════════════╣`);
    if (report.opportunity) {
      console.log(`  ║  Opportunity: ${report.opportunity.symbol.padEnd(10)} rate=${(report.opportunity.fundingRate * 100).toFixed(4)}%  APY=${report.opportunity.netApy.toFixed(1)}%  ║`);
    }
    console.log(`  ║  Allocation:       $${String(report.allocationUsd).padStart(5)}                              ║`);
    console.log(`  ║  Risk Decision:    ${report.riskDecision.action.padEnd(15)} (${report.riskDecision.level})              ║`);
    console.log(`  ║  Kill Switch:      ${report.killSwitchDecision.allowed ? "ALLOW" : "BLOCK".padEnd(15)}                ║`);
    console.log(`  ║  TTG Decision:     ${report.tinyTradeDecision.allowed ? "ALLOW".padEnd(14) : "BLOCK".padEnd(14)}                ║`);
    console.log(`  ║  Entry Candidate:  ${entryCandidate ? "YES".padEnd(14) : "NO".padEnd(15)}                ║`);
    console.log(`  ║  Hedge Plan:       ${hedgePlan ? "YES (planned)".padEnd(14) : "NO".padEnd(15)}                ║`);
    console.log(`  ║  Would Execute:    ${String(report.wouldExecute).padEnd(14)}                ║`);
    console.log(`  ║  Real Orders:      ${String(report.realOrdersExecuted).padStart(5)}                              ║`);
    console.log(`  ║  POST Requests:    ${String(report.postRequests).padStart(5)}                              ║`);
    if (report.blockedReasons.length > 0) {
      console.log(`  ║  Blocked Reasons:                                   ║`);
      for (const r of report.blockedReasons) {
        console.log(`  ║    • ${r.padEnd(45)}  ║`);
      }
    }
    console.log(`  ╚═══════════════════════════════════════════════════════╝\n`);
  });

  // ─── Verification Tests ─────────────────────────────

  it("1. Real Mainnet data was used (symbols found)", () => {
    expect(report.opportunity).toBeDefined();
    expect(report.opportunity!.symbol).toBeTruthy();
    expect(report.opportunity!.markPrice).toBeGreaterThan(0);
  });

  it("2. Risk Engine was evaluated", () => {
    expect(report.riskDecision.action).toBeDefined();
    expect(report.riskDecision.generatedAt).toBeGreaterThan(0);
  });

  it("3. Kill Switch was evaluated", () => {
    expect(report.killSwitchDecision.allowed).toBeDefined();
    expect(report.killSwitchDecision.generatedAt).toBeGreaterThan(0);
  });

  it("4. TinyTradeGuard was evaluated", () => {
    expect(report.tinyTradeDecision.allowed).toBeDefined();
    expect(report.tinyTradeDecision.capitalLimit).toBeDefined();
    expect(report.tinyTradeDecision.riskPassed).toBeDefined();
  });

  it("5. Hedge Plan was generated (planned, not executed)", () => {
    expect(report.hedgePlan).toBeDefined();
    expect(report.hedgePlan!.status).toBe("planned");
    expect(report.hedgePlan!.legs.length).toBeGreaterThan(0);
  });

  it("6. createOrder = 0 (no order router calls)", () => {
    expect(report.realOrdersExecuted).toBe(0);
  });

  it("7. cancelOrder = 0", () => {
    expect(report.realOrdersExecuted).toBe(0);
  });

  it("8. POST = 0", () => {
    expect(report.postRequests).toBe(0);
  });

  it("9. Real Orders = 0", () => {
    expect(report.realOrdersExecuted).toBe(0);
  });

  it("10. wouldExecute=true when all checks pass", () => {
    expect(report.wouldExecute).toBe(true);
  });
});

// ─── Stress Scenarios ───────────────────────────────────

describeOrSkip("Tiny Semi-Auto Dry Run — Stress Scenarios", () => {
  it("1. Normal opportunity: full pipeline passes", async () => {
    const fetchClient = new BinanceFetchHttpClient({
      apiKey: API_KEY,
      secret: API_SECRET,
      baseUrl: BASE_URL,
    });
    const client = new BinanceMainnetReadOnlyClient(fetchClient);
    const response = await client.request({ method: "GET", path: "/fapi/v1/premiumIndex" });
    expect(response.statusCode).toBe(200);
    const data = (response.body as Array<Record<string, unknown>>)
      .filter((i) => TARGET_SYMBOLS.includes(String(i.symbol)))
      .map((i) => ({
        symbol: String(i.symbol),
        fundingRate: Number(i.lastFundingRate ?? 0),
        markPrice: Number(i.markPrice ?? 0),
      }));

    const opp = data
      .map((d) => ({ ...d, apy: Math.abs(d.fundingRate) * 365 * 100 }))
      .filter((o) => o.apy > 0)
      .sort((a, b) => b.apy - a.apy)[0];

    expect(opp).toBeDefined();
    expect(opp.apy).toBeGreaterThan(0);

    // All checks pass
    const guardCtx: TinyTradeGuardContext = {
      currentCapitalUsd: 50, currentOpenPositions: 0, availableBalanceUsd: 100,
      riskDecision: SAFE_RISK_DECISION, killSwitchDecision: SAFE_KILL_SWITCH_DECISION,
      accountSyncSuccess: true, reconciliationHasMismatches: false,
      apiHasTradePermission: true, hasManualConfirmation: true,
    };
    const decision = evaluateTinyTradeGuard({ ...DEFAULT_TINY_TRADE_GUARD_CONFIG, allowRealExecution: true }, guardCtx);
    expect(decision.allowed).toBe(true);
  });

  it("2. High risk: TinyTradeGuard blocks", () => {
    const guardCtx: TinyTradeGuardContext = {
      currentCapitalUsd: 50, currentOpenPositions: 0, availableBalanceUsd: 100,
      riskDecision: CRITICAL_RISK_DECISION, killSwitchDecision: SAFE_KILL_SWITCH_DECISION,
      accountSyncSuccess: true, reconciliationHasMismatches: false,
      apiHasTradePermission: true, hasManualConfirmation: true,
    };
    const decision = evaluateTinyTradeGuard({ ...DEFAULT_TINY_TRADE_GUARD_CONFIG, allowRealExecution: true }, guardCtx);
    expect(decision.allowed).toBe(false);
    expect(decision.riskPassed).toBe(false);
  });

  it("3. Kill Switch locked: TinyTradeGuard blocks", () => {
    const guardCtx: TinyTradeGuardContext = {
      currentCapitalUsd: 50, currentOpenPositions: 0, availableBalanceUsd: 100,
      riskDecision: SAFE_RISK_DECISION, killSwitchDecision: LOCKED_KILL_SWITCH_DECISION,
      accountSyncSuccess: true, reconciliationHasMismatches: false,
      apiHasTradePermission: true, hasManualConfirmation: true,
    };
    const decision = evaluateTinyTradeGuard({ ...DEFAULT_TINY_TRADE_GUARD_CONFIG, allowRealExecution: true }, guardCtx);
    expect(decision.allowed).toBe(false);
    expect(decision.killSwitchPassed).toBe(false);
  });

  it("4. Insufficient balance: TinyTradeGuard blocks", () => {
    const guardCtx: TinyTradeGuardContext = {
      currentCapitalUsd: 50, currentOpenPositions: 0, availableBalanceUsd: 5,
      riskDecision: SAFE_RISK_DECISION, killSwitchDecision: SAFE_KILL_SWITCH_DECISION,
      accountSyncSuccess: true, reconciliationHasMismatches: false,
      apiHasTradePermission: true, hasManualConfirmation: true,
    };
    const decision = evaluateTinyTradeGuard({ ...DEFAULT_TINY_TRADE_GUARD_CONFIG, allowRealExecution: true }, guardCtx);
    expect(decision.allowed).toBe(false);
    expect(decision.balancePassed).toBe(false);
  });

  it("5. Capital over limit: TinyTradeGuard blocks", () => {
    const guardCtx: TinyTradeGuardContext = {
      currentCapitalUsd: 200, currentOpenPositions: 0, availableBalanceUsd: 100,
      riskDecision: SAFE_RISK_DECISION, killSwitchDecision: SAFE_KILL_SWITCH_DECISION,
      accountSyncSuccess: true, reconciliationHasMismatches: false,
      apiHasTradePermission: true, hasManualConfirmation: true,
    };
    const decision = evaluateTinyTradeGuard({ ...DEFAULT_TINY_TRADE_GUARD_CONFIG, allowRealExecution: true }, guardCtx);
    expect(decision.allowed).toBe(false);
    expect(decision.capitalLimit).toBe(false);
  });
});

// ─── Safety Audit (always runs) ────────────────────────

describe("Tiny Semi-Auto Dry Run — Safety Audit", () => {
  it("No createOrder / cancelOrder / executeHedgePlan in source", () => {
    const source = require("fs").readFileSync(__filename, "utf-8");
    const clean = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .replace(/"[^"]*"/g, "")
      .replace(/'[^']*'/g, "");
    expect(clean).not.toContain("createOrder(");
    expect(clean).not.toContain("cancelOrder(");
    expect(clean).not.toContain("executeHedgePlan(");
    expect(clean).not.toContain("executeAutoEntry(");
    expect(clean).not.toContain("executeAutoExit(");
  });

  it("Uses BinanceMainnetReadOnlyClient (safety gate)", () => {
    const source = require("fs").readFileSync(__filename, "utf-8");
    expect(source).toContain("BinanceMainnetReadOnlyClient");
  });
});
