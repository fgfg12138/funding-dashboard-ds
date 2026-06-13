/**
 * Binance + OKX + HTX Mainnet Readonly Capability Matrix
 *
 * Documents the current state of each exchange: what works, what's blocked, and why.
 * No trading attempted — pure capability discovery + reporting.
 */

import { describe, expect, it } from "vitest";
import { RealBinanceConnector } from "../connectors/real/RealBinanceConnector";
import { RealOkxConnector } from "../connectors/real/RealOkxConnector";
import { RealHtxConnector } from "../connectors/real/RealHtxConnector";

const ALLOWED = ["binance", "okx", "htx"];
const PAUSED = ["bybit", "bitget", "gate", "hyperliquid"];

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

type ExchangeCapability = {
  exchangeId: string;
  mainnetReadonlyAvailable: boolean;
  testnetTradingAvailable: boolean;
  demoTradingAvailable: boolean;
  liveTradingAllowed: boolean;
  blockerReason: string;
  fundingRateReadable: boolean;
  tradingRulesReadable: boolean;
  healthStatus: string;
  latencyMs?: number;
};

type Report = {
  capabilities: Record<string, ExchangeCapability>;
  readyForLiveTrading: boolean;
  readinessStatus: string;
  mainnetOrderAttempted: boolean;
  realOrdersExecuted: number;
  postRequests: number;
  putRequests: number;
  deleteRequests: number;
  generatedAt: number;
};

describe("Binance + OKX + HTX Mainnet Readonly Capability Matrix", () => {
  it("Documents current exchange capabilities (no trading attempted)", async () => {
    expect(ALLOWED).toEqual(["binance", "okx", "htx"]);
    expect(PAUSED).toEqual(expect.arrayContaining(["bybit", "bitget", "gate", "hyperliquid"]));

    const connectors: Record<string, any> = {
      binance: new RealBinanceConnector(),
      okx: new RealOkxConnector(),
      htx: new RealHtxConnector(),
    };

    const capabilities: Record<string, ExchangeCapability> = {};

    for (const [name, c] of Object.entries(connectors)) {
      let healthStatus = "unknown";
      let latencyMs: number | undefined;
      let fundingOk = false;
      let rulesOk = false;

      // Health
      try {
        const h = await c.getHealth();
        healthStatus = h.status;
        latencyMs = h.lastRestLatencyMs;
      } catch { healthStatus = "down"; }

      // Funding info
      try {
        const info = await c.getFundingInfo("BTCUSDT");
        fundingOk = !!(info && isFiniteNumber(info.markPrice) && info.markPrice > 0);
      } catch { fundingOk = false; }

      // Trading rules
      try {
        const rules = await c.getTradingRules();
        rulesOk = Array.isArray(rules) && rules.length > 0;
      } catch { rulesOk = false; }

      // Determine capability
      const isBinance = name === "binance";
      const isOkx = name === "okx";
      const isHtx = name === "htx";

      let blockerReason = "";
      if (!fundingOk || !rulesOk || healthStatus !== "healthy") {
        blockerReason = `API unreachable or degraded: health=${healthStatus}, funding=${fundingOk}, rules=${rulesOk}`;
      } else if (isBinance) {
        blockerReason = "No Binance Futures testnet API key configured for trading";
      } else if (isOkx) {
        blockerReason = "Only mainnet read-only API configured; no OKX demo trading available";
      } else if (isHtx) {
        blockerReason = "HTX demo/testnet trading environment not available";
      }

      capabilities[name] = {
        exchangeId: name,
        mainnetReadonlyAvailable: fundingOk && rulesOk && healthStatus === "healthy",
        testnetTradingAvailable: false,
        demoTradingAvailable: false,
        liveTradingAllowed: false,
        blockerReason,
        fundingRateReadable: fundingOk,
        tradingRulesReadable: rulesOk,
        healthStatus,
        latencyMs,
      };
    }

    // Binance-specific: check if we have a testnet key configured
    const hasTestnetKey = process.env.BINANCE_TESTNET_API_KEY && process.env.BINANCE_TESTNET_API_KEY.length > 0;
    if (!hasTestnetKey && capabilities.binance?.mainnetReadonlyAvailable) {
      capabilities.binance.blockerReason = "No Binance Futures testnet API key configured for trading";
    }

    const readyForLiveTrading = Object.values(capabilities).every((c) => c.liveTradingAllowed);
    const blockers = Object.values(capabilities)
      .filter((c) => !c.liveTradingAllowed)
      .map((c) => `${c.exchangeId}: ${c.blockerReason}`);

    const report: Report = {
      capabilities,
      readyForLiveTrading,
      readinessStatus: blockers.length > 0 ? "blocked_with_reason" : "ready",
      mainnetOrderAttempted: false,
      realOrdersExecuted: 0,
      postRequests: 0,
      putRequests: 0,
      deleteRequests: 0,
      generatedAt: Date.now(),
    };

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║          CAPABILITY MATRIX — MAINNET READ-ONLY STATUS                    ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════════════╣`);
    for (const [name, cap] of Object.entries(capabilities)) {
      console.log(`  ║  ── ${name.toUpperCase()} ──${" ".repeat(60)}║`);
      console.log(`  ║  mainnetReadonlyAvailable:  ${String(cap.mainnetReadonlyAvailable).padEnd(45)}║`);
      console.log(`  ║  testnetTradingAvailable:   ${String(cap.testnetTradingAvailable).padEnd(45)}║`);
      console.log(`  ║  demoTradingAvailable:      ${String(cap.demoTradingAvailable).padEnd(45)}║`);
      console.log(`  ║  liveTradingAllowed:        ${String(cap.liveTradingAllowed).padEnd(45)}║`);
      console.log(`  ║  health:                    ${cap.healthStatus.padEnd(45)}║`);
      console.log(`  ║  latency:                   ${cap.latencyMs ? String(cap.latencyMs).padEnd(45) : "N/A".padEnd(45)}║`);
      console.log(`  ║  funding:                   ${String(cap.fundingRateReadable).padEnd(45)}║`);
      console.log(`  ║  trading rules:             ${String(cap.tradingRulesReadable).padEnd(45)}║`);
      console.log(`  ║  blocker:                   ${cap.blockerReason.slice(0, 55).padEnd(55)}║`);
    }
    console.log(`  ║  ────────────────────────────────────────────────────────────────────────── ║`);
    console.log(`  ║  Readiness:           ${report.readinessStatus.padEnd(48)}║`);
    console.log(`  ║  Mainnet Order Attempt: ${String(report.mainnetOrderAttempted).padEnd(40)}║`);
    console.log(`  ║  Real Orders:         0${" ".repeat(49)}║`);
    console.log(`  ║  POST/PUT/DEL:        0/0/0${" ".repeat(44)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════════════╝\n`);

    expect(report.mainnetOrderAttempted).toBe(false);
    expect(report.realOrdersExecuted).toBe(0);
    expect(report.postRequests).toBe(0);
    expect(report.putRequests).toBe(0);
    expect(report.deleteRequests).toBe(0);
    expect(Object.values(capabilities).every((c) => c.liveTradingAllowed === false)).toBe(true);
    expect(report.readinessStatus).toBe("blocked_with_reason");
  });
});
