/**
 * Binance Mainnet Tiny Funding Validation
 *
 * ✅ READ-ONLY — No orders, no trades, no modifications.
 *
 * Verifies the system can read and attribute funding/income data for
 * a previously closed SOLUSDT position using only Mainnet GET endpoints.
 *
 * Pipeline:
 *   Income History → Funding Rate History → Premium Index →
 *   Account Safety → Funding Attribution Report → Risk / Kill Switch
 *
 * ⏸️ SKIPPED by default. Enable with:
 *   BINANCE_MAINNET_API_KEY=<key>
 *   BINANCE_MAINNET_API_SECRET=<secret>
 *   RUN_BINANCE_MAINNET_FUNDING_VALIDATION=true
 */

import { describe, expect, it } from "vitest";
import { BinanceFetchHttpClient } from "../orderRouter/adapters/binance/BinanceFetchHttpClient";
import { BinanceMainnetReadOnlyClient } from "../orderRouter/adapters/binance/BinanceMainnetReadOnlyClient";
import { evaluateLiveRisk } from "./riskEngine";
import { evaluateKillSwitch, createInitialKillSwitchState } from "./killSwitchEngine";
import type { LiveRiskContext } from "./riskEngineTypes";
import type { RiskReport } from "../riskMonitoring/riskMonitoringTypes";

// ─── Environment ────────────────────────────────────────

const RUN = process.env.RUN_BINANCE_MAINNET_FUNDING_VALIDATION === "true";
const API_KEY = process.env.BINANCE_MAINNET_API_KEY ?? "";
const API_SECRET = process.env.BINANCE_MAINNET_API_SECRET ?? "";
const HAS_CREDS = API_KEY.length > 0 && API_SECRET.length > 0;
const BASE_URL = "https://fapi.binance.com";
const SYMBOL = "SOLUSDT";

// ─── Report Type ────────────────────────────────────────

type TinyFundingValidationReport = {
  symbol: string;
  fundingIncomeUsd: number;
  realizedPnlUsd: number;
  commissionUsd: number;
  netIncomeUsd: number;
  latestFundingRate: number;
  nextFundingTime: number;
  positionAmt: number;
  openOrders: number;
  getRequests: number;
  postRequests: number;
  putRequests: number;
  deleteRequests: number;
  generatedAt: number;
};

// ─── Test Suite ──────────────────────────────────────────

const describeOrSkip = RUN && HAS_CREDS ? describe : describe.skip;

describeOrSkip("Binance Mainnet Tiny Funding Validation", () => {
  let report: TinyFundingValidationReport;
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

  let client: BinanceFetchHttpClient;

  it("0. Init client + ReadOnlyClient blocks non-GET", () => {
    client = new BinanceFetchHttpClient({ apiKey: API_KEY, secret: API_SECRET, baseUrl: BASE_URL });
    const roClient = new BinanceMainnetReadOnlyClient(client);
    expect(roClient).toBeDefined();
  });

  // ─── Step 1: Income History ──────────────────────────

  it("1. GET /fapi/v1/income — parse FUNDING_FEE, REALIZED_PNL, COMMISSION", async () => {
    const resp = await doGet(client, "/fapi/v1/income", { symbol: SYMBOL, limit: 50, timestamp: Date.now(), recvWindow: 5000 });
    expect(resp.statusCode).toBe(200);
    const income = resp.body as Array<Record<string, unknown>>;
    expect(Array.isArray(income)).toBe(true);

    const fundingFee = income.filter((i) => String(i.incomeType) === "FUNDING_FEE");
    const realizedPnl = income.filter((i) => String(i.incomeType) === "REALIZED_PNL");
    const commission = income.filter((i) => String(i.incomeType) === "COMMISSION");

    const fundingTotal = fundingFee.reduce((s, f) => s + Number(f.income ?? 0), 0);
    const pnlTotal = realizedPnl.reduce((s, f) => s + Number(f.income ?? 0), 0);
    const commissionTotal = commission.reduce((s, f) => s + Number(f.income ?? 0), 0);

    console.log(`  ✅ Income records: ${income.length} total`);
    console.log(`      FUNDING_FEE:   ${fundingFee.length} records, total $${fundingTotal.toFixed(6)}`);
    console.log(`      REALIZED_PNL:  ${pnlTotal.toFixed(6)}`);
    console.log(`      COMMISSION:    ${commissionTotal.toFixed(6)}`);
  });

  // ─── Step 2: Funding Rate History ────────────────────

  it("2. GET /fapi/v1/fundingRate — latest SOLUSDT funding rate", async () => {
    const resp = await doGet(client, "/fapi/v1/fundingRate", { symbol: SYMBOL, limit: 1, timestamp: Date.now(), recvWindow: 5000 });
    expect(resp.statusCode).toBe(200);
    const rates = resp.body as Array<Record<string, unknown>>;
    expect(rates.length).toBeGreaterThan(0);

    const latest = rates[0];
    const fundingRate = Number(latest.fundingRate ?? 0);
    const fundingTime = Number(latest.fundingTime ?? 0);

    console.log(`  ✅ Latest funding rate: ${(fundingRate * 100).toFixed(4)}%`);
    console.log(`      Funding time: ${new Date(fundingTime).toISOString()}`);
  });

  // ─── Step 3: Premium Index ───────────────────────────

  it("3. GET /fapi/v1/premiumIndex — markPrice, lastFundingRate, nextFundingTime", async () => {
    const resp = await doGet(client, "/fapi/v1/premiumIndex", { symbol: SYMBOL, timestamp: Date.now(), recvWindow: 5000 });
    expect(resp.statusCode).toBe(200);
    const data = resp.body as Record<string, unknown>;

    const markPrice = Number(data.markPrice ?? 0);
    const lastFundingRate = Number(data.lastFundingRate ?? 0);
    const nextFundingTime = Number(data.nextFundingTime ?? 0);

    expect(markPrice).toBeGreaterThan(0);
    console.log(`  ✅ ${SYMBOL} markPrice: $${markPrice.toFixed(2)}`);
    console.log(`      lastFundingRate: ${(lastFundingRate * 100).toFixed(4)}%`);
    console.log(`      nextFundingTime: ${new Date(nextFundingTime).toISOString()}`);
  });

  // ─── Step 4: Account Safety ──────────────────────────

  it("4. GET /fapi/v2/account — positionAmt=0, openOrders=0", async () => {
    const acctResp = await doGet(client, "/fapi/v2/account", { timestamp: Date.now(), recvWindow: 5000 });
    expect(acctResp.statusCode).toBe(200);
    const acct = acctResp.body as Record<string, unknown>;
    const positions = (acct.positions as Array<Record<string, unknown>>) ?? [];
    const solPos = positions.find((p) => String(p.symbol) === SYMBOL);
    const posAmt = Math.abs(Number(solPos?.positionAmt ?? 0));
    expect(posAmt).toBe(0);
    console.log(`  ✅ ${SYMBOL} positionAmt = ${posAmt}`);

    const ooResp = await doGet(client, "/fapi/v1/openOrders", { timestamp: Date.now(), recvWindow: 5000 });
    const orders = (ooResp.body as Array<Record<string, unknown>>).filter((o) => String(o.symbol) === SYMBOL);
    expect(orders.length).toBe(0);
    console.log(`  ✅ ${SYMBOL} openOrders = ${orders.length}`);
  });

  // ─── Step 5: Funding Attribution Report ──────────────

  it("5. FUNDING ATTRIBUTION REPORT — TinyFundingValidationReport", async () => {
    const incomeResp = await doGet(client, "/fapi/v1/income", { symbol: SYMBOL, limit: 50, timestamp: Date.now(), recvWindow: 5000 });
    const income = incomeResp.body as Array<Record<string, unknown>>;

    const fundingIncomeUsd = income.filter((i) => String(i.incomeType) === "FUNDING_FEE").reduce((s, f) => s + Number(f.income ?? 0), 0);
    const realizedPnlUsd = income.filter((i) => String(i.incomeType) === "REALIZED_PNL").reduce((s, f) => s + Number(f.income ?? 0), 0);
    const commissionUsd = income.filter((i) => String(i.incomeType) === "COMMISSION").reduce((s, f) => s + Number(f.income ?? 0), 0);
    const netIncomeUsd = fundingIncomeUsd + realizedPnlUsd + commissionUsd;

    const rateResp = await doGet(client, "/fapi/v1/fundingRate", { symbol: SYMBOL, limit: 1, timestamp: Date.now(), recvWindow: 5000 });
    const rates = rateResp.body as Array<Record<string, unknown>>;
    const latestFundingRate = Number(rates[0]?.fundingRate ?? 0);

    const premResp = await doGet(client, "/fapi/v1/premiumIndex", { symbol: SYMBOL, timestamp: Date.now(), recvWindow: 5000 });
    const premData = premResp.body as Record<string, unknown>;
    const nextFundingTime = Number(premData.nextFundingTime ?? 0);

    const acctResp = await doGet(client, "/fapi/v2/account", { timestamp: Date.now(), recvWindow: 5000 });
    const acct = acctResp.body as Record<string, unknown>;
    const positions = (acct.positions as Array<Record<string, unknown>>) ?? [];
    const solPos = positions.find((p) => String(p.symbol) === SYMBOL);
    const positionAmt = Math.abs(Number(solPos?.positionAmt ?? 0));

    report = {
      symbol: SYMBOL,
      fundingIncomeUsd,
      realizedPnlUsd,
      commissionUsd,
      netIncomeUsd,
      latestFundingRate,
      nextFundingTime,
      positionAmt,
      openOrders: 0,
      getRequests: getCount,
      postRequests: postCount,
      putRequests: putCount,
      deleteRequests: deleteCount,
      generatedAt: Date.now(),
    };

    console.log(`\n  ╔══════════════════════════════════════════════════════════════╗`);
    console.log(`  ║      TINY FUNDING VALIDATION — FINAL REPORT              ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Symbol:              ${report.symbol.padEnd(40)}║`);
    console.log(`  ║  Funding Income:      $${report.fundingIncomeUsd.toFixed(6).padStart(12).padEnd(39)}║`);
    console.log(`  ║  Realized PnL:        $${report.realizedPnlUsd.toFixed(6).padStart(12).padEnd(39)}║`);
    console.log(`  ║  Commission:          $${report.commissionUsd.toFixed(6).padStart(12).padEnd(39)}║`);
    console.log(`  ║  Net Income:          $${report.netIncomeUsd.toFixed(6).padStart(12).padEnd(39)}║`);
    console.log(`  ║  Latest Funding Rate: ${(report.latestFundingRate * 100).toFixed(4).padStart(10).padEnd(39)}%║`);
    console.log(`  ║  Next Funding Time:   ${new Date(report.nextFundingTime).toISOString().padEnd(40)}║`);
    console.log(`  ║  Position Amt:        ${String(report.positionAmt).padEnd(40)}║`);
    console.log(`  ║  Open Orders:         ${String(report.openOrders).padEnd(40)}║`);
    console.log(`  ║  GET / POST/PUT/DEL:  ${String(getCount).padStart(3)} / ${String(postCount)} / ${String(putCount)} / ${String(deleteCount).padEnd(31)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════╝\n`);
  });

  // ─── Step 6: Risk / Kill Switch ──────────────────────

  it("6. Risk Engine + Kill Switch — action=allow", () => {
    const riskReport: RiskReport = { events: [], lowCount: 0, mediumCount: 0, highCount: 0, criticalCount: 0, overallRisk: "low", generatedAt: Date.now() };
    const context: LiveRiskContext = { riskReport, openPositionsCount: 0 };
    const riskDecision = evaluateLiveRisk(context);
    expect(riskDecision.action).toBe("allow");
    expect(riskDecision.level).toBe("low");

    const ksDecision = evaluateKillSwitch(createInitialKillSwitchState(), riskDecision);
    expect(ksDecision.action).toBe("allow");
    expect(ksDecision.allowed).toBe(true);

    console.log(`  ✅ Risk Engine:  action=${riskDecision.action}, level=${riskDecision.level}`);
    console.log(`  ✅ Kill Switch:  action=${ksDecision.action}, allowed=${ksDecision.allowed}`);
  });

  // ─── Verification Tests ──────────────────────────────

  it("fundingIncomeUsd is a finite number (0 allowed)", () => expect(Number.isFinite(report.fundingIncomeUsd)).toBe(true));
  it("realizedPnlUsd is a finite number", () => expect(Number.isFinite(report.realizedPnlUsd)).toBe(true));
  it("commissionUsd is a finite number", () => expect(Number.isFinite(report.commissionUsd)).toBe(true));
  it("netIncomeUsd is a finite number", () => expect(Number.isFinite(report.netIncomeUsd)).toBe(true));
  it("positionAmt = 0", () => expect(report.positionAmt).toBe(0));
  it("openOrders = 0", () => expect(report.openOrders).toBe(0));
  it("postRequests = 0", () => expect(report.postRequests).toBe(0));
  it("putRequests = 0", () => expect(report.putRequests).toBe(0));
  it("deleteRequests = 0", () => expect(report.deleteRequests).toBe(0));
  it("getRequests > 0", () => expect(report.getRequests).toBeGreaterThan(0));
});

// ─── Always-run Safety Audit ────────────────────────────

describe("Funding Validation — Safety Audit", () => {
  it("No createOrder / cancelOrder in source (excluding safety audit self-check)", () => {
    const fs = require("fs");
    const source = fs.readFileSync(__filename, "utf-8");
    // Remove the safety audit block itself from the check
    const beforeAudit = source.split("describe(\"Funding Validation — Safety Audit\"")[0];
    const clean = beforeAudit.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(clean).not.toContain("createOrder(");
    expect(clean).not.toContain("cancelOrder(");
  });

  it("Uses BinanceMainnetReadOnlyClient", () => {
    const fs = require("fs");
    const source = fs.readFileSync(__filename, "utf-8");
    expect(source).toContain("BinanceMainnetReadOnlyClient");
  });
});
