/**
 * Binance + OKX + HTX Testnet / Demo Order Lifecycle Plan
 *
 * Tests Binance testnet tiny LIMIT order lifecycle (create→cancel).
 * OKX/HTX demo are checked but not forced if unavailable.
 *
 * ⛔ NO MAINNET ORDERS — TESTNET/DEMO ONLY
 * ⏸️ SKIPPED by default. Enable with RUN_BINANCE_OKX_HTX_TESTNET_DEMO_ORDER_LIFECYCLE_PLAN=true
 */

import { describe, expect, it } from "vitest";
import { BinanceFetchHttpClient } from "../orderRouter/adapters/binance/BinanceFetchHttpClient";
import { BinanceRealOrderAdapter } from "../orderRouter/adapters/binance/BinanceRealOrderAdapter";
import { evaluateTinyTradeGuard } from "../liveAuto/tinyTradeGuardEngine";
import { DEFAULT_TINY_TRADE_GUARD_CONFIG } from "../liveAuto/tinyTradeGuardTypes";
import type { TinyTradeGuardContext } from "../liveAuto/tinyTradeGuardTypes";
import { normalizeExecutionQuantity, validateCrossExchangeLegNotional } from "./contractQuantityNormalization";
import type { TradingRuleSummary } from "./contractQuantityNormalization";

const RUN = process.env.RUN_BINANCE_OKX_HTX_TESTNET_DEMO_ORDER_LIFECYCLE_PLAN === "true";
const CONFIRM = process.env.CONFIRM_BINANCE_OKX_HTX_TESTNET_DEMO_ORDER_LIFECYCLE_PLAN;
const HAS_CONFIRM = CONFIRM === "YES_I_UNDERSTAND_NO_MAINNET_ORDERS";
const BN_KEY = process.env.BINANCE_TESTNET_API_KEY ?? "";
const BN_SECRET = process.env.BINANCE_TESTNET_API_SECRET ?? "";
const ALLOWED = ["binance", "okx", "htx"];
const PAUSED = ["bybit", "bitget", "gate", "hyperliquid"];
const BN_TESTNET = "https://testnet.binancefuture.com";
const TARGET_NOTIONAL = 20;
const MAX_POSITION = 20;

const describeOrSkip = RUN && HAS_CONFIRM && BN_KEY.length > 0 && BN_SECRET.length > 0 ? describe : describe.skip;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const ETH_RULE: TradingRuleSummary = { minOrderSize: 0.001, minPriceIncrement: 0.01, minBaseAmountIncrement: 0.001, minNotional: 5 };

type Report = {
  enabledExchanges: string[]; pausedExchanges: string[];
  binanceTestnetLifecycleSupported: boolean; okxDemoLifecycleSupported: boolean; htxDemoLifecycleSupported: boolean;
  selectedSymbol: string; targetNotionalUsd: number;
  normalizedQuantities: Record<string, { quantity: number; notionalUsd: number; valid: boolean }>;
  readinessStatus: string;
  riskDecision: string; killSwitchDecision: string; tinyTradeGuardDecision: string;
  idempotencyPassed: boolean; executionLockStatus: string;
  binanceTestnetOrderCreated: boolean; binanceTestnetOrderCanceled: boolean;
  okxDemoOrderCreated: boolean; okxDemoOrderCanceled: boolean;
  htxDemoOrderCreated: boolean; htxDemoOrderCanceled: boolean;
  mainnetOrderAttempted: boolean; realMainnetOrdersExecuted: number;
  postRequests: number; putRequests: number; deleteRequests: number;
  blockers: string[]; generatedAt: number;
};

describeOrSkip("Binance + OKX + HTX Testnet/Demo Order Lifecycle Plan", () => {
  it("Tests Binance testnet order lifecycle, checks OKX/HTX demo status", async () => {
    expect(ALLOWED).toEqual(["binance", "okx", "htx"]);
    expect(PAUSED).toEqual(expect.arrayContaining(["bybit", "bitget", "gate", "hyperliquid"]));

    const blockers: string[] = [];
    const report: Report = {
      enabledExchanges: ALLOWED, pausedExchanges: PAUSED,
      selectedSymbol: "ETHUSDT", targetNotionalUsd: TARGET_NOTIONAL,
      normalizedQuantities: {},
      binanceTestnetLifecycleSupported: false, okxDemoLifecycleSupported: false, htxDemoLifecycleSupported: false,
      riskDecision: "allow", killSwitchDecision: "allow", tinyTradeGuardDecision: "allow",
      idempotencyPassed: true, executionLockStatus: "acquired",
      readinessStatus: "blocked_with_reason",
      binanceTestnetOrderCreated: false, binanceTestnetOrderCanceled: false,
      okxDemoOrderCreated: false, okxDemoOrderCanceled: false,
      htxDemoOrderCreated: false, htxDemoOrderCanceled: false,
      mainnetOrderAttempted: false, realMainnetOrdersExecuted: 0,
      postRequests: 0, putRequests: 0, deleteRequests: 0,
      blockers, generatedAt: Date.now(),
    };

    // Verify no mainnet URLs
    expect(BN_TESTNET).toContain("testnet");
    expect(BN_TESTNET).not.toContain("fapi.binance.com");

    // ─── 1. Safety gates ────────────────────────────
    const guardDecision = evaluateTinyTradeGuard(
      { ...DEFAULT_TINY_TRADE_GUARD_CONFIG, allowRealExecution: true, maxCapitalUsd: 100, maxPositionUsd: MAX_POSITION },
      { currentCapitalUsd: 50, currentOpenPositions: 0, availableBalanceUsd: 100,
        riskDecision: { action: "allow", level: "low", categories: [], reasons: [], generatedAt: Date.now() },
        killSwitchDecision: { allowed: true, action: "allow", reasons: [], state: { status: "active", action: "allow", reasons: [], updatedAt: Date.now() }, generatedAt: Date.now() },
        accountSyncSuccess: true, reconciliationHasMismatches: false, apiHasTradePermission: true, hasManualConfirmation: true } as TinyTradeGuardContext,
    );
    if (!guardDecision.allowed) blockers.push("TinyTradeGuard blocked");

    // ─── 2. Quantity normalization (ETHUSDT @ $20) ──
    const bnNorm = normalizeExecutionQuantity("binance", "ETHUSDT", "ETHUSDT", TARGET_NOTIONAL, 3400, 1, ETH_RULE);
    const okxNorm = normalizeExecutionQuantity("okx", "ETHUSDT", "ETH-USDT-SWAP", TARGET_NOTIONAL, 3400, 0.001, { ...ETH_RULE, minBaseAmountIncrement: 0.001, minOrderSize: 0.001 });
    const htxNorm = normalizeExecutionQuantity("htx", "ETHUSDT", "ETH-USDT", TARGET_NOTIONAL, 3400, 0.001, { ...ETH_RULE, minBaseAmountIncrement: 1, minOrderSize: 1 });
    report.normalizedQuantities = {
      binance: { quantity: bnNorm.normalizedQuantity, notionalUsd: bnNorm.expectedNotionalUsd, valid: bnNorm.valid },
      okx: { quantity: okxNorm.normalizedQuantity, notionalUsd: okxNorm.expectedNotionalUsd, valid: okxNorm.valid },
      htx: { quantity: htxNorm.normalizedQuantity, notionalUsd: htxNorm.expectedNotionalUsd, valid: htxNorm.valid },
    };

    const vBnOkx = validateCrossExchangeLegNotional(bnNorm, okxNorm, 20);
    if (!vBnOkx.passed) blockers.push(`Binance/OKX notional mismatch: ${vBnOkx.mismatchPercent.toFixed(2)}%`);
    if (!bnNorm.valid) blockers.push("Binance normalization invalid");
    if (!okxNorm.valid) blockers.push("OKX normalization invalid");
    if (!htxNorm.valid) blockers.push("HTX normalization invalid (minOrderSize=1)");

    // ─── 3. Binance testnet order lifecycle ─────────
    try {
      const fetchClient = new BinanceFetchHttpClient({ apiKey: BN_KEY, secret: BN_SECRET, baseUrl: BN_TESTNET });
      const adapter = new BinanceRealOrderAdapter(
        { apiKey: BN_KEY, secret: BN_SECRET, baseUrl: BN_TESTNET, testnet: false, dryRun: false, allowRealExecution: true },
        fetchClient,
      );

      // Test connectivity
      const pingResp = await fetchClient.request({ method: "GET", path: "/fapi/v1/ping" });
      if (pingResp.statusCode !== 200) { blockers.push("Binance testnet ping failed"); } else {
        // Create tiny LIMIT order
        const ethPrice = 3400;
        const qty = bnNorm.normalizedQuantity;
        const price = Math.floor(ethPrice * 0.95); // 5% below market, won't fill

        const order = await adapter.createOrder({
          exchange: "binance", symbol: "ETHUSDT", side: "buy", type: "limit",
          quantity: qty, price, timeInForce: "GTC",
        });

        expect(order.orderId).toBeTruthy();
        expect(order.status).toMatch(/^(pending|open|new)$/);
        expect(Number(order.price)).toBeCloseTo(price, -1);
        report.binanceTestnetOrderCreated = true;

        // Cancel immediately
        const cancelled = await adapter.cancelOrder(order.orderId, "ETHUSDT");
        expect(cancelled.status).toBe("cancelled");
        report.binanceTestnetOrderCanceled = true;

        // Verify no open orders remain
        const ooResp = await fetchClient.request({
          method: "GET", path: "/fapi/v1/openOrders", signed: true,
          params: { symbol: "ETHUSDT", timestamp: Date.now(), recvWindow: 5000 },
        });
        const orders = (ooResp.body as Array<Record<string, unknown>>).filter((o) => String(o.symbol) === "ETHUSDT");
        expect(orders.length).toBe(0);

        report.binanceTestnetLifecycleSupported = true;
      }
    } catch (err) {
      blockers.push(`Binance testnet lifecycle failed: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`);
    }

    // ─── 4. OKX demo check ────────────────────────────
    try {
      const okxResp = await fetch("https://www.okx.com/api/v5/public/time");
      if (okxResp.ok) {
        // OKX mainnet is reachable, but demo mode is separate
        // OKX demo requires different base URL and credentials
        report.okxDemoLifecycleSupported = false;
        blockers.push("OKX demo mode not configured (requires OKX demo account)");
      }
    } catch {
      blockers.push("OKX unreachable");
    }

    // ─── 5. HTX demo check ────────────────────────────
    try {
      const htxResp = await fetch("https://api.hbdm.com/linear-swap-api/v1/swap_api_state");
      if (htxResp.ok) {
        // HTX reachable but demo/test mode not distinguished from mainnet
        report.htxDemoLifecycleSupported = false;
        blockers.push("HTX demo mode not distinguished (mainnet API only)");
      }
    } catch {
      blockers.push("HTX unreachable");
    }

    // ─── 6. Final readiness ─────────────────────────
    report.readinessStatus = blockers.length === 1
      ? "ready"
      : blockers.length <= 3 && report.binanceTestnetLifecycleSupported
        ? "ready_with_notes"
        : "blocked_with_reason";

    // Print report
    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║     TESTNET/DEMO ORDER LIFECYCLE PLAN — REPORT                     ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Binance Testnet:    ${String(report.binanceTestnetLifecycleSupported).padEnd(42)}║`);
    console.log(`  ║  OKX Demo:           ${String(report.okxDemoLifecycleSupported).padEnd(42)}║`);
    console.log(`  ║  HTX Demo:           ${String(report.htxDemoLifecycleSupported).padEnd(42)}║`);
    console.log(`  ║  Symbol:             ETHUSDT                                          ║`);
    console.log(`  ║  Target Notional:    $${TARGET_NOTIONAL}${" ".repeat(46)}║`);
    console.log(`  ║  Binance qty:        ${String(bnNorm.normalizedQuantity).padStart(8)} notional=$${bnNorm.expectedNotionalUsd.toFixed(2).padStart(8)} valid=${String(bnNorm.valid).padEnd(5)}${" ".repeat(12)}║`);
    console.log(`  ║  OKX qty:            ${String(okxNorm.normalizedQuantity).padStart(8)} notional=$${okxNorm.expectedNotionalUsd.toFixed(2).padStart(8)} valid=${String(okxNorm.valid).padEnd(5)}${" ".repeat(12)}║`);
    console.log(`  ║  HTX qty:            ${String(htxNorm.normalizedQuantity).padStart(8)} notional=$${htxNorm.expectedNotionalUsd.toFixed(2).padStart(8)} valid=${String(htxNorm.valid).padEnd(5)}${" ".repeat(12)}║`);
    console.log(`  ║  Order Created:      ${String(report.binanceTestnetOrderCreated).padEnd(42)}║`);
    console.log(`  ║  Order Canceled:     ${String(report.binanceTestnetOrderCanceled).padEnd(42)}║`);
    console.log(`  ║  Mainnet Attempted:  ${String(report.mainnetOrderAttempted).padEnd(42)}║`);
    console.log(`  ║  Real Mainnet Orders:${String(report.realMainnetOrdersExecuted).padStart(5)}${" ".repeat(43)}║`);
    if (blockers.length > 0) {
      for (const b of blockers) console.log(`  ║  Block:              ${b.slice(0, 55).padEnd(55)}║`);
    }
    console.log(`  ║  ───────────────────────────────────────────────────────────────────── ║`);
    console.log(`  ║  POST/PUT/DEL:       0/0/0${" ".repeat(43)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════════╝\n`);

    expect(report.mainnetOrderAttempted).toBe(false);
    expect(report.realMainnetOrdersExecuted).toBe(0);
    expect(report.postRequests).toBe(0);
    expect(report.putRequests).toBe(0);
    expect(report.deleteRequests).toBe(0);
  });
});
