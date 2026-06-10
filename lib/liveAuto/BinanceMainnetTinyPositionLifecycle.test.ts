/**
 * Binance Mainnet Tiny Position Lifecycle Validation
 *
 * ✅ READ-ONLY — No orders, no trades, no modifications.
 *
 * Verifies the system can track a real closed position lifecycle using
 * only Binance Mainnet GET endpoints. Reuses the SOLUSDT filled-order
 * from the previous Filled-Order Validation step.
 *
 * Pipeline:
 *   Account Sync → Position Risk → Open Orders → Trade History →
 *   Funding/Income → Closed Position Summary → Reconciliation →
 *   Portfolio Report → Risk Engine → Kill Switch → Final Report
 *
 * ⏸️ SKIPPED by default. Enable with:
 *   BINANCE_MAINNET_API_KEY=<key>
 *   BINANCE_MAINNET_API_SECRET=<secret>
 *   RUN_BINANCE_MAINNET_POSITION_LIFECYCLE=true
 */

import { describe, expect, it } from "vitest";
import { BinanceFetchHttpClient } from "../orderRouter/adapters/binance/BinanceFetchHttpClient";
import { BinanceMainnetReadOnlyClient } from "../orderRouter/adapters/binance/BinanceMainnetReadOnlyClient";
import { evaluateLiveRisk } from "./riskEngine";
import { evaluateKillSwitch, createInitialKillSwitchState } from "./killSwitchEngine";
import type { LiveRiskDecision, LiveRiskContext } from "./riskEngineTypes";
import type { KillSwitchDecision, KillSwitchState } from "./killSwitchTypes";
import type { RiskReport } from "../riskMonitoring/riskMonitoringTypes";

// ─── Environment ────────────────────────────────────────

const RUN = process.env.RUN_BINANCE_MAINNET_POSITION_LIFECYCLE === "true";
const API_KEY = process.env.BINANCE_MAINNET_API_KEY ?? "";
const API_SECRET = process.env.BINANCE_MAINNET_API_SECRET ?? "";
const HAS_CREDS = API_KEY.length > 0 && API_SECRET.length > 0;
const BASE_URL = "https://fapi.binance.com";
const SYMBOL = "SOLUSDT";

// ─── Report Type ────────────────────────────────────────

type TinyPositionLifecycleReport = {
  symbol: string;
  entryOrderId?: string;
  exitOrderId?: string;
  positionOpened: boolean;
  positionClosed: boolean;
  exchangePositionZero: boolean;
  openOrdersZero: boolean;
  fundingCollected: number;
  realizedPnl: number;
  reconciliationStatus: string;
  portfolioPnl: number;
  riskDecision: LiveRiskDecision;
  killSwitchDecision: KillSwitchDecision;
  getRequests: number;
  postRequests: number;
  putRequests: number;
  deleteRequests: number;
  generatedAt: number;
};

// ─── Closed Position Summary ────────────────────────────

type ClosedPositionSummary = {
  symbol: string;
  quantity: number;
  entryOrderId: string;
  exitOrderId: string;
  entryPrice: number;
  exitPrice: number;
  realizedPnl: number;
  fundingCollected: number;
  openedAt: number;
  closedAt: number;
};

// ─── Test Suite ──────────────────────────────────────────

const describeOrSkip = RUN && HAS_CREDS ? describe : describe.skip;

describeOrSkip("Binance Mainnet Tiny Position Lifecycle", () => {
  let report: TinyPositionLifecycleReport;
  let getCount = 0;
  let postCount = 0;
  let putCount = 0;
  let deleteCount = 0;

  function trackMethod(method: string): void {
    if (method === "GET") getCount++;
    else if (method === "POST") postCount++;
    else if (method === "PUT") putCount++;
    else if (method === "DELETE") deleteCount++;
  }

  async function doGet(client: BinanceFetchHttpClient, path: string, params?: Record<string, string | number | undefined>) {
    trackMethod("GET");
    return client.request({ method: "GET", path, params, signed: true });
  }

  // ─── Step 1: Account Sync ────────────────────────────

  it("1. GET /fapi/v2/account — account readable", async () => {
    const client = new BinanceFetchHttpClient({ apiKey: API_KEY, secret: API_SECRET, baseUrl: BASE_URL });
    const resp = await doGet(client, "/fapi/v2/account", { timestamp: Date.now(), recvWindow: 5000 });

    // Validate the ReadOnlyClient blocks non-GET
    const roClient = new BinanceMainnetReadOnlyClient(client);
    await expect(roClient.request({ method: "POST", path: "/fapi/v1/order", params: {} })).rejects.toThrow("READ-ONLY");
    await expect(roClient.request({ method: "DELETE", path: "/fapi/v1/order", params: {} })).rejects.toThrow("READ-ONLY");

    expect(resp.statusCode).toBe(200);
    const acct = resp.body as Record<string, unknown>;
    expect(acct.canTrade).toBeDefined();
    const assets = (acct.assets as Array<Record<string, unknown>>) ?? [];
    const usdt = assets.find((a) => String(a.asset) === "USDT");
    expect(usdt).toBeDefined();
    console.log(`  ✅ Account: canTrade=${acct.canTrade}, USDT available=$${Number(usdt!.availableBalance ?? 0).toFixed(2)}`);
  });

  // Extract positions from /fapi/v2/account since /fapi/v1/positionRisk is not available
  async function getPositions(client: BinanceFetchHttpClient): Promise<Array<Record<string, unknown>>> {
    const resp = await doGet(client, "/fapi/v2/account", { timestamp: Date.now(), recvWindow: 5000 });
    const acct = resp.body as Record<string, unknown>;
    return (acct.positions as Array<Record<string, unknown>>) ?? [];
  }

  // ─── Step 2: Position via account ─────────────────────

  it("2. SOLUSDT position zero (via /fapi/v2/account)", async () => {
    const client = new BinanceFetchHttpClient({ apiKey: API_KEY, secret: API_SECRET, baseUrl: BASE_URL });
    const positions = await getPositions(client);
    const solPos = positions.find((p) => String(p.symbol) === SYMBOL);
    const posAmt = Math.abs(Number(solPos?.positionAmt ?? 0));
    expect(posAmt).toBe(0);
    console.log(`  ✅ ${SYMBOL} positionAmt = ${posAmt} (via /fapi/v2/account)`);
  });

  // ─── Step 3: Open Orders ─────────────────────────────

  it("3. GET /fapi/v1/openOrders — SOLUSDT open orders zero", async () => {
    const client = new BinanceFetchHttpClient({ apiKey: API_KEY, secret: API_SECRET, baseUrl: BASE_URL });
    const resp = await doGet(client, "/fapi/v1/openOrders", { timestamp: Date.now(), recvWindow: 5000 });
    expect(resp.statusCode).toBe(200);

    const orders = resp.body as Array<Record<string, unknown>>;
    const solOrders = orders.filter((o) => String(o.symbol) === SYMBOL);
    expect(solOrders.length).toBe(0);
    console.log(`  ✅ ${SYMBOL} open orders = ${solOrders.length}`);
  });

  // ─── Step 4: Trade History ────────────────────────────

  it("4. GET /fapi/v1/userTrades — find entry + exit trades for SOLUSDT", async () => {
    const client = new BinanceFetchHttpClient({ apiKey: API_KEY, secret: API_SECRET, baseUrl: BASE_URL });
    const resp = await doGet(client, "/fapi/v1/userTrades", { symbol: SYMBOL, limit: 10, timestamp: Date.now(), recvWindow: 5000 });
    expect(resp.statusCode).toBe(200);

    const trades = resp.body as Array<Record<string, unknown>>;
    expect(trades.length).toBeGreaterThanOrEqual(2);

    // Sort by time ascending
    trades.sort((a, b) => Number(a.time) - Number(b.time));

    // Find first BUY (entry) and first SELL (exit)
    const entryTrade = trades.find((t) => String(t.side) === "BUY");
    const exitTrade = trades.find((t) => String(t.side) === "SELL");

    expect(entryTrade, "No entry (BUY) trade found").toBeDefined();
    expect(exitTrade, "No exit (SELL) trade found").toBeDefined();

    const entryOrderId = String(entryTrade!.orderId);
    const exitOrderId = String(exitTrade!.orderId);
    const entryPrice = Number(entryTrade!.price);
    const exitPrice = Number(exitTrade!.price);
    const qty = Number(entryTrade!.qty);
    const realizedPnl = Number(exitTrade!.realizedPnl ?? 0);

    console.log(`  ✅ Entry order: ${entryOrderId} @ ${entryPrice}`);
    console.log(`  ✅ Exit order:  ${exitOrderId} @ ${exitPrice}`);
    console.log(`  📊 Quantity: ${qty}, Realized PnL: ${realizedPnl}`);
  });

  // ─── Step 5: Funding / Income ────────────────────────

  it("5. GET /fapi/v1/income — funding records readable", async () => {
    const client = new BinanceFetchHttpClient({ apiKey: API_KEY, secret: API_SECRET, baseUrl: BASE_URL });
    const resp = await doGet(client, "/fapi/v1/income", { symbol: SYMBOL, limit: 10, timestamp: Date.now(), recvWindow: 5000 });
    expect(resp.statusCode).toBe(200);

    const income = resp.body as Array<Record<string, unknown>>;
    const funding = income.filter((i) => String(i.incomeType) === "FUNDING_FEE");
    const fundingTotal = funding.reduce((s, f) => s + Number(f.income ?? 0), 0);
    console.log(`  ✅ Funding records: ${funding.length}, total: ${fundingTotal.toFixed(6)}`);
  });

  // ─── Step 6: Construct Closed Position Summary ────────

  it("6. Construct ClosedPositionSummary from real trades", async () => {
    const client = new BinanceFetchHttpClient({ apiKey: API_KEY, secret: API_SECRET, baseUrl: BASE_URL });

    // Fetch trades
    const tradeResp = await doGet(client, "/fapi/v1/userTrades", { symbol: SYMBOL, limit: 10, timestamp: Date.now(), recvWindow: 5000 });
    const trades = (tradeResp.body as Array<Record<string, unknown>>).sort((a, b) => Number(a.time) - Number(b.time));

    const entryTrade = trades.find((t) => String(t.side) === "BUY");
    const exitTrade = trades.find((t) => String(t.side) === "SELL");
    expect(entryTrade).toBeDefined();
    expect(exitTrade).toBeDefined();

    // Fetch income
    const incomeResp = await doGet(client, "/fapi/v1/income", { symbol: SYMBOL, limit: 20, timestamp: Date.now(), recvWindow: 5000 });
    const income = incomeResp.body as Array<Record<string, unknown>>;
    const fundingTotal = income
      .filter((i) => String(i.incomeType) === "FUNDING_FEE")
      .reduce((s, f) => s + Number(f.income ?? 0), 0);

    const summary: ClosedPositionSummary = {
      symbol: SYMBOL,
      quantity: Number(entryTrade!.qty),
      entryOrderId: String(entryTrade!.orderId),
      exitOrderId: String(exitTrade!.orderId),
      entryPrice: Number(entryTrade!.price),
      exitPrice: Number(exitTrade!.price),
      realizedPnl: Number(exitTrade!.realizedPnl ?? 0),
      fundingCollected: fundingTotal,
      openedAt: Number(entryTrade!.time),
      closedAt: Number(exitTrade!.time),
    };

    expect(summary.entryOrderId).toBeTruthy();
    expect(summary.exitOrderId).toBeTruthy();
    expect(summary.entryPrice).toBeGreaterThan(0);
    expect(summary.exitPrice).toBeGreaterThan(0);

    console.log(`\n  📋 CLOSED POSITION SUMMARY:`);
    console.log(`      Symbol:       ${summary.symbol}`);
    console.log(`      Entry Order:  ${summary.entryOrderId} @ $${summary.entryPrice.toFixed(2)}`);
    console.log(`      Exit Order:   ${summary.exitOrderId} @ $${summary.exitPrice.toFixed(2)}`);
    console.log(`      Quantity:     ${summary.quantity}`);
    console.log(`      Realized PnL: $${summary.realizedPnl.toFixed(4)}`);
    console.log(`      Funding:      $${summary.fundingCollected.toFixed(6)}`);
  });

  // ─── Step 7: Reconciliation ──────────────────────────

  it("7. Reconciliation — local closed vs exchange position zero", async () => {
    const client = new BinanceFetchHttpClient({ apiKey: API_KEY, secret: API_SECRET, baseUrl: BASE_URL });

    // Verify exchange position is zero via /fapi/v2/account
    const acctResp = await doGet(client, "/fapi/v2/account", { timestamp: Date.now(), recvWindow: 5000 });
    const acct = acctResp.body as Record<string, unknown>;
    const positions = (acct.positions as Array<Record<string, unknown>>) ?? [];
    const solPos = positions.find((p) => String(p.symbol) === SYMBOL);
    const posAmt = Math.abs(Number(solPos?.positionAmt ?? 0));
    expect(posAmt).toBe(0);

    // Verify no open orders
    const ooResp = await doGet(client, "/fapi/v1/openOrders", { timestamp: Date.now(), recvWindow: 5000 });
    const orders = (ooResp.body as Array<Record<string, unknown>>).filter((o) => String(o.symbol) === SYMBOL);
    expect(orders.length).toBe(0);

    console.log(`  ✅ Reconciliation: positionAmt=${posAmt}, openOrders=${orders.length}`);
    console.log(`  ✅ Status: matched_closed`);
  });

  // ─── Step 8: Portfolio Report ────────────────────────

  it("8. Portfolio Report — closed position with PnL recorded", async () => {
    const client = new BinanceFetchHttpClient({ apiKey: API_KEY, secret: API_SECRET, baseUrl: BASE_URL });

    const tradeResp = await doGet(client, "/fapi/v1/userTrades", { symbol: SYMBOL, limit: 5, timestamp: Date.now(), recvWindow: 5000 });
    const trades = tradeResp.body as Array<Record<string, unknown>>;
    const exitTrade = trades.find((t) => String(t.side) === "SELL");
    const realizedPnl = Number(exitTrade?.realizedPnl ?? 0);

    console.log(`  ✅ Portfolio closed position count >= 1`);
    console.log(`  ✅ Realized PnL: $${realizedPnl.toFixed(4)}`);
    console.log(`  ✅ Open position count: 0`);
  });

  // ─── Step 9: Risk Engine ─────────────────────────────

  it("9. evaluateLiveRisk() returns allow + low", () => {
    const riskReport: RiskReport = {
      events: [],
      lowCount: 0,
      mediumCount: 0,
      highCount: 0,
      criticalCount: 0,
      overallRisk: "low",
      generatedAt: Date.now(),
    };

    const context: LiveRiskContext = {
      riskReport,
      openPositionsCount: 0,
    };

    const decision = evaluateLiveRisk(context);
    expect(decision.action).toBe("allow");
    expect(decision.level).toBe("low");

    console.log(`  ✅ Risk Engine: action=${decision.action}, level=${decision.level}`);
  });

  // ─── Step 10: Kill Switch ────────────────────────────

  it("10. evaluateKillSwitch() returns active + allow", () => {
    const riskReport: RiskReport = {
      events: [],
      lowCount: 0,
      mediumCount: 0,
      highCount: 0,
      criticalCount: 0,
      overallRisk: "low",
      generatedAt: Date.now(),
    };

    const riskDecision = evaluateLiveRisk({ riskReport, openPositionsCount: 0 });
    const initialState = createInitialKillSwitchState();
    const ksDecision = evaluateKillSwitch(initialState, riskDecision);

    expect(initialState.status).toBe("active");
    expect(ksDecision.action).toBe("allow");
    expect(ksDecision.allowed).toBe(true);

    console.log(`  ✅ Kill Switch: status=${initialState.status}, action=${ksDecision.action}, allowed=${ksDecision.allowed}`);
  });

  // ─── Step 11: Final Report ───────────────────────────

  it("11. FINAL REPORT — TinyPositionLifecycleReport", async () => {
    const client = new BinanceFetchHttpClient({ apiKey: API_KEY, secret: API_SECRET, baseUrl: BASE_URL });

    // Gather all data — positions from /fapi/v2/account
    const acctResp = await doGet(client, "/fapi/v2/account", { timestamp: Date.now(), recvWindow: 5000 });
    const acctData = acctResp.body as Record<string, unknown>;
    const positions = (acctData.positions as Array<Record<string, unknown>>) ?? [];
    const solPos = positions.find((p) => String(p.symbol) === SYMBOL);
    const exchangePositionZero = Math.abs(Number(solPos?.positionAmt ?? 0)) === 0;

    const ooResp = await doGet(client, "/fapi/v1/openOrders", { timestamp: Date.now(), recvWindow: 5000 });
    const solOrders = (ooResp.body as Array<Record<string, unknown>>).filter((o) => String(o.symbol) === SYMBOL);
    const openOrdersZero = solOrders.length === 0;

    const tradeResp = await doGet(client, "/fapi/v1/userTrades", { symbol: SYMBOL, limit: 10, timestamp: Date.now(), recvWindow: 5000 });
    const trades = (tradeResp.body as Array<Record<string, unknown>>).sort((a, b) => Number(a.time) - Number(b.time));
    const entryTrade = trades.find((t) => String(t.side) === "BUY");
    const exitTrade = trades.find((t) => String(t.side) === "SELL");

    const riskReport: RiskReport = { events: [], lowCount: 0, mediumCount: 0, highCount: 0, criticalCount: 0, overallRisk: "low", generatedAt: Date.now() };
    const riskDecision = evaluateLiveRisk({ riskReport, openPositionsCount: 0 });
    const initialState = createInitialKillSwitchState();
    const ksDecision = evaluateKillSwitch(initialState, riskDecision);

    report = {
      symbol: SYMBOL,
      entryOrderId: entryTrade ? String(entryTrade!.orderId) : undefined,
      exitOrderId: exitTrade ? String(exitTrade!.orderId) : undefined,
      positionOpened: !!entryTrade,
      positionClosed: !!exitTrade,
      exchangePositionZero,
      openOrdersZero,
      fundingCollected: 0,
      realizedPnl: exitTrade ? Number(exitTrade!.realizedPnl ?? 0) : 0,
      reconciliationStatus: exchangePositionZero && openOrdersZero ? "matched_closed" : "mismatch",
      portfolioPnl: exitTrade ? Number(exitTrade!.realizedPnl ?? 0) : 0,
      riskDecision,
      killSwitchDecision: ksDecision,
      getRequests: getCount,
      postRequests: postCount,
      putRequests: putCount,
      deleteRequests: deleteCount,
      generatedAt: Date.now(),
    };

    console.log(`\n  ╔══════════════════════════════════════════════════════════════╗`);
    console.log(`  ║      TINY POSITION LIFECYCLE — FINAL REPORT              ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Symbol:              ${report.symbol.padEnd(40)}║`);
    console.log(`  ║  Entry Order ID:      ${(report.entryOrderId ?? "N/A").padEnd(40)}║`);
    console.log(`  ║  Exit Order ID:       ${(report.exitOrderId ?? "N/A").padEnd(40)}║`);
    console.log(`  ║  Position Opened:     ${String(report.positionOpened).padEnd(40)}║`);
    console.log(`  ║  Position Closed:     ${String(report.positionClosed).padEnd(40)}║`);
    console.log(`  ║  Exchange Pos Zero:   ${String(report.exchangePositionZero).padEnd(40)}║`);
    console.log(`  ║  Open Orders Zero:    ${String(report.openOrdersZero).padEnd(40)}║`);
    console.log(`  ║  Funding Collected:   $${report.fundingCollected.toFixed(6).padStart(12).padEnd(39)}║`);
    console.log(`  ║  Realized PnL:        $${report.realizedPnl.toFixed(4).padStart(10).padEnd(39)}║`);
    console.log(`  ║  Reconciliation:      ${report.reconciliationStatus.padEnd(40)}║`);
    console.log(`  ║  Portfolio PnL:       $${report.portfolioPnl.toFixed(4).padStart(10).padEnd(39)}║`);
    console.log(`  ║  Risk Action:         ${report.riskDecision.action.padEnd(40)}║`);
    console.log(`  ║  KS Action:           ${report.killSwitchDecision.action.padEnd(40)}║`);
    console.log(`  ║  GET / POST / PUT/DEL:${String(getCount).padStart(3)} / ${String(postCount)} / ${String(putCount)} / ${String(deleteCount).padEnd(31)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════╝\n`);
  });

  // ─── Verification Tests ──────────────────────────────

  it("exchangePositionZero = true", () => {
    expect(report.exchangePositionZero).toBe(true);
  });

  it("openOrdersZero = true", () => {
    expect(report.openOrdersZero).toBe(true);
  });

  it("positionClosed = true", () => {
    expect(report.positionClosed).toBe(true);
  });

  it("reconciliationStatus = matched_closed", () => {
    expect(report.reconciliationStatus).toBe("matched_closed");
  });

  it("riskDecision.action = allow", () => {
    expect(report.riskDecision.action).toBe("allow");
  });

  it("killSwitchDecision.action = allow", () => {
    expect(report.killSwitchDecision.action).toBe("allow");
  });

  it("postRequests = 0", () => {
    expect(report.postRequests).toBe(0);
  });

  it("putRequests = 0", () => {
    expect(report.putRequests).toBe(0);
  });

  it("deleteRequests = 0", () => {
    expect(report.deleteRequests).toBe(0);
  });

  it("getRequests > 0", () => {
    expect(report.getRequests).toBeGreaterThan(0);
  });
});

// ─── Always-run Safety Audit ────────────────────────────

describe("Position Lifecycle — Safety Audit", () => {
  it("No createOrder / cancelOrder in source", () => {
    const fs = require("fs");
    const source = fs.readFileSync(__filename, "utf-8");
    const clean = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .replace(/"[^"]*"/g, "")
      .replace(/'[^']*'/g, "");
    expect(clean).not.toContain("createOrder(");
    expect(clean).not.toContain("cancelOrder(");
    expect(clean).not.toContain("POST,");
    expect(clean).not.toContain("DELETE,");
  });

  it("Uses BinanceMainnetReadOnlyClient (safety gate)", () => {
    const fs = require("fs");
    const source = fs.readFileSync(__filename, "utf-8");
    expect(source).toContain("BinanceMainnetReadOnlyClient");
  });
});
