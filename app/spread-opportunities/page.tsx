"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { StatCard, ExchangeTierBadge } from "@/components/ui/dashboard";
import { createMockConnectors } from "@/lib/connectors/mocks/createMockConnectors";
import { createRealConnectors } from "@/lib/connectors/real/createRealConnectors";
import { findCrossExchangeFundingSpreads } from "@/lib/fundingSpread/fundingSpreadEngine";
import { runSpreadPaperTraderStep, createInitialState, generateSpreadPaperTraderReport } from "@/lib/fundingSpreadPaperTrader/spreadPaperTraderEngine";
import { DEFAULT_PAPER_TRADER_CONFIG } from "@/lib/fundingSpreadPaperTrader/spreadPaperTraderTypes";
import { DEFAULT_SPREAD_CONFIG } from "@/lib/fundingSpread/fundingSpreadTypes";
import type { FundingSpreadOpportunity } from "@/lib/fundingSpread/fundingSpreadTypes";
import type { SpreadPaperTraderState, SpreadPaperPosition } from "@/lib/fundingSpreadPaperTrader/spreadPaperTraderTypes";

// ─── Types ─────────────────────────────────────────────

type DataMode = "mock" | "real";

type ExchangeHealthInfo = {
  status: string;
  latencyMs?: number;
};

type SpreadPageData = {
  opportunities: FundingSpreadOpportunity[];
  topOpp: FundingSpreadOpportunity | undefined;
  traderState: SpreadPaperTraderState;
  report: ReturnType<typeof generateSpreadPaperTraderReport>;
  loaded: boolean;
};

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

// ─── Page Component ─────────────────────────────────────

export default function SpreadOpportunitiesPage() {
  const [mode, setMode] = useState<DataMode>("mock");
  const [mockData, setMockData] = useState<SpreadPageData | null>(null);
  const [realData, setRealData] = useState<SpreadPageData | null>(null);
  const [realHealth, setRealHealth] = useState<Record<string, ExchangeHealthInfo> | null>(null);
  const [realError, setRealError] = useState(false);
  const mockRef = useRef(false);
  const realRef = useRef(false);

  const loadedData = mode === "real" && realData ? realData : mockData;
  const displayData = loadedData;

  // ── Load Mock Data ────────────────────────────────

  const loadMockData = useCallback(async () => {
    if (mockRef.current) return;
    mockRef.current = true;
    try {
      const connectors = createMockConnectors();
      const config = { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 };
      const opportunities = await findCrossExchangeFundingSpreads(connectors, SYMBOLS, config);

      const state = createInitialState({ ...DEFAULT_PAPER_TRADER_CONFIG, minNetSpreadApy: 0 });
      const { newState } = await runSpreadPaperTraderStep(connectors, SYMBOLS, state, { ...DEFAULT_PAPER_TRADER_CONFIG, minNetSpreadApy: 0 });
      const report = generateSpreadPaperTraderReport(newState);

      setMockData({ opportunities, topOpp: opportunities[0], traderState: newState, report, loaded: true });
    } finally {
      mockRef.current = false;
    }
  }, []);

  // ── Load Real Data ────────────────────────────────

  const loadRealData = useCallback(async () => {
    if (realRef.current) return;
    realRef.current = true;
    try {
      const connectors = createRealConnectors();

      // Health checks
      const health: Record<string, ExchangeHealthInfo> = {};
      for (const [name, c] of Object.entries(connectors)) {
        try {
          const h = await c.getHealth();
          health[name] = { status: h.status, latencyMs: h.lastRestLatencyMs };
        } catch {
          health[name] = { status: "down" };
        }
      }
      setRealHealth(health);

      // Spread engine
      const config = { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 };
      const opportunities = await findCrossExchangeFundingSpreads(connectors as any, SYMBOLS, config);
      const topOpp = opportunities[0];

      setRealData({ opportunities, topOpp, traderState: createInitialState(DEFAULT_PAPER_TRADER_CONFIG), report: { totalCapitalUsd: 0, allocatedCapitalUsd: 0, capitalUtilizationPercent: 0, openPositionCount: 0, closedPositionCount: 0, totalFundingCollectedUsd: 0, totalTradingPnlUsd: 0, totalPnlUsd: 0, topPosition: undefined }, loaded: true });
      setRealError(false);
    } catch {
      setRealError(true);
    } finally {
      realRef.current = false;
    }
  }, []);

  useEffect(() => {
    void loadMockData();
  }, [loadMockData]);

  useEffect(() => {
    if (mode === "real") {
      void loadRealData();
    }
  }, [mode, loadRealData]);

  return (
    <PageShell activeHref="/spread-opportunities" title="跨所套利" description="跨交易所资金费率套利 — Mock Paper / Real Data Shadow" showRefresh={false}>
      {/* ── Safety Banner ── */}
      <section className="border border-amber-800/40 bg-amber-950/20">
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs">
          <span className="font-semibold text-amber-200">{mode === "mock" ? "Paper Trading" : "Real Data Shadow"}</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">Real Orders: <span className="text-red-300 font-medium">0</span></span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">Trading: <span className="text-red-300 font-medium">Disabled</span></span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">Source: {mode === "mock" ? "Mock Connectors" : "Public Funding APIs"}</span>
          <span className="text-slate-500">|</span>
          <span className="text-yellow-200 font-medium">⚠️ Read-only — not live trading</span>
        </div>
      </section>

      {/* ── Mode Toggle ── */}
      <section className="border border-slate-800 bg-slate-950/60">
        <div className="flex items-center gap-3 px-4 py-2">
          <span className="text-xs text-slate-400">Data Mode:</span>
          {(["mock", "real"] as const).map((m) => (
            <button
              key={m}
              className={`border px-3 py-1.5 text-xs ${mode === m ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100" : "border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600"}`}
              onClick={() => setMode(m)}
              type="button"
            >
              {m === "mock" ? "🧪 Mock Paper" : "🔭 Real Data Shadow"}
            </button>
          ))}
          {realError && mode === "real" && (
            <span className="text-xs text-red-300">⚠️ Some real data unavailable</span>
          )}
        </div>
      </section>

      {/* ── Exchange Health Cards (Real mode) ── */}
      {mode === "real" && realHealth && (
        <section className="grid gap-2 sm:grid-cols-3">
          {Object.entries(realHealth).map(([name, h]) => (
            <div key={name} className="border border-slate-800 bg-slate-950/60 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-100">{name}</span>
                <ExchangeHealthBadge status={h.status} />
              </div>
              <p className="mt-1 text-xs text-slate-500">latency: {h.latencyMs ? `${h.latencyMs}ms` : "N/A"}</p>
            </div>
          ))}
        </section>
      )}

      {/* ── Summary Cards ── */}
      {displayData ? (
        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="最高净 APY" value={displayData.topOpp ? `${displayData.topOpp.netSpreadApy.toFixed(1)}%` : "-"} tone="green" />
          <StatCard label="发现机会" value={String(displayData.opportunities.length)} tone="cyan" />
          <StatCard label={mode === "mock" ? "模拟持仓" : "Real Positions"} value={mode === "mock" ? String(displayData.report.openPositionCount) : "N/A (read-only)"} tone="slate" />
          <StatCard label={mode === "mock" ? "模拟总 Funding" : "Real Funding Data"} value={mode === "mock" ? `$${displayData.report.totalFundingCollectedUsd.toFixed(2)}` : "Read-only"} tone={mode === "mock" && displayData.report.totalFundingCollectedUsd >= 0 ? "green" : "slate"} />
          <StatCard label="最佳配对" value={displayData.topOpp ? `${displayData.topOpp.shortExchangeId}-${displayData.topOpp.longExchangeId}` : "-"} tone="cyan" />
        </section>
      ) : (
        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="border border-slate-800 bg-slate-950/60 px-4 py-3">
              <div className="animate-pulse h-3 w-16 bg-slate-800 mb-2" />
              <div className="animate-pulse h-6 w-24 bg-slate-800" />
            </div>
          ))}
        </section>
      )}

      {/* ── Spread Opportunities Table ── */}
      <section className="border border-slate-800 bg-slate-950/60">
        <div className="border-b border-slate-800 px-4 py-2">
          <h2 className="text-sm font-semibold text-white">Spread 机会</h2>
          <span className="ml-2 text-xs text-slate-500">Source: {mode === "mock" ? "Mock" : "Real"}</span>
        </div>
        <div className="max-h-[400px] overflow-auto">
          <table className="min-w-[1200px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-950 text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-800">
                <th className="px-3 py-2 text-left">Symbol</th>
                <th className="px-3 py-2 text-left">Short</th>
                <th className="px-3 py-2 text-left">Long</th>
                <th className="px-3 py-2 text-right">Short Rate</th>
                <th className="px-3 py-2 text-right">Long Rate</th>
                <th className="px-3 py-2 text-right">Spread</th>
                <th className="px-3 py-2 text-right">APY</th>
                <th className="px-3 py-2 text-right">Net APY</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-center">Source</th>
                <th className="px-3 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(displayData?.opportunities.length ?? 0) === 0 && (
                <tr><td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={11}>暂无 spread 机会。</td></tr>
              )}
              {displayData?.opportunities.slice(0, 20).map((opp) => (
                <tr className="bg-slate-950/20 hover:bg-slate-900/70" key={opp.id}>
                  <td className="px-3 py-2 font-semibold text-slate-100">{opp.canonicalSymbol}</td>
                  <td className="px-3 py-2"><ExchangeTierBadge exchangeId={opp.shortExchangeId} /></td>
                  <td className="px-3 py-2"><ExchangeTierBadge exchangeId={opp.longExchangeId} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{(opp.shortLeg.fundingRate * 100).toFixed(4)}%</td>
                  <td className="px-3 py-2 text-right tabular-nums">{(opp.longLeg.fundingRate * 100).toFixed(4)}%</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{(opp.spreadRate * 100).toFixed(4)}%</td>
                  <td className="px-3 py-2 text-right tabular-nums text-cyan-300">{opp.spreadApy.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{opp.netSpreadApy.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right"><ScoreBadge score={opp.score} /></td>
                  <td className="px-3 py-2 text-center"><SpreadSourceBadge isReal={mode === "real"} /></td>
                  <td className="px-3 py-2 text-center">
                    <span className={`border px-2 py-0.5 text-xs ${mode === "mock" ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"}`}>
                      {mode === "mock" ? "Paper Only" : "Read Only"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Mock Paper Trader Panel — only in Mock mode ── */}
      {mode === "mock" && mockData && (
        <section className="grid gap-2 lg:grid-cols-2">
          <div className="border border-slate-800 bg-slate-950/60">
            <div className="border-b border-slate-800 px-4 py-2">
              <h2 className="text-sm font-semibold text-white">模拟仓位</h2>
            </div>
            <div className="p-4 text-xs">
              {mockData.traderState.openPositions.length === 0 ? (
                <p className="text-slate-500">当前无持仓。</p>
              ) : (
                <div className="space-y-2">
                  {mockData.traderState.openPositions.map((pos) => (
                    <PositionCard key={pos.id} position={pos} />
                  ))}
                </div>
              )}
              {mockData.traderState.closedPositions.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-200">
                    已平仓 ({mockData.traderState.closedPositions.length})
                  </summary>
                  <div className="mt-2 space-y-1">
                    {mockData.traderState.closedPositions.slice(0, 5).map((pos) => (
                      <div key={pos.id} className="border border-slate-800 bg-slate-950/30 px-3 py-1.5 text-xs">
                        <span className="text-slate-400">{pos.canonicalSymbol}</span>{" "}
                        <span className="text-slate-500">{pos.shortExchangeId} x {pos.longExchangeId}</span>{" "}
                        <span className={pos.totalPnlUsd >= 0 ? "text-emerald-300" : "text-red-300"}>${pos.totalPnlUsd.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
          <div className="border border-slate-800 bg-slate-950/60">
            <div className="border-b border-slate-800 px-4 py-2">
              <h2 className="text-sm font-semibold text-white">模拟摘要</h2>
            </div>
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              <StatCard label="总 PnL" value={`$${mockData.report.totalPnlUsd.toFixed(2)}`} tone={mockData.report.totalPnlUsd >= 0 ? "green" : "red"} />
              <StatCard label="Funding 收入" value={`$${mockData.report.totalFundingCollectedUsd.toFixed(2)}`} tone="cyan" />
              <StatCard label="资本利用率" value={`${mockData.report.capitalUtilizationPercent.toFixed(1)}%`} tone="slate" />
              <StatCard label="已平仓数" value={String(mockData.report.closedPositionCount)} tone="slate" />
            </div>
          </div>
        </section>
      )}

      {/* ── Explanation Panel ── */}
      <section className="border border-slate-800 bg-slate-950/60">
        <div className="border-b border-slate-800 px-4 py-2">
          <h2 className="text-sm font-semibold text-white">工作原理</h2>
        </div>
        <div className="space-y-2 p-4 text-xs text-slate-400">
          <p><strong className="text-cyan-300">核心逻辑：</strong>跨交易所资金费率套利。</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>同一永续合约在不同交易所的 funding rate 不同</li>
            <li>在 funding rate <strong className="text-emerald-300">较高</strong> 的交易所 <strong className="text-slate-200">做空</strong>（收 funding）</li>
            <li>在 funding rate <strong className="text-emerald-300">较低</strong> 的交易所 <strong className="text-slate-200">做多</strong>（收 funding）</li>
            <li>spread = shortRate - longRate，即每 funding interval 的净收入</li>
          </ul>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="border border-amber-800/30 bg-amber-950/10 px-3 py-2">
              <p className="text-xs font-semibold text-amber-200">🧪 Mock Paper</p>
              <p className="mt-0.5 text-xs text-slate-500">使用 Mock Connectors，6 个交易所模拟数据。包含 Paper Trader 模拟开平仓。</p>
            </div>
            <div className="border border-cyan-800/30 bg-cyan-950/10 px-3 py-2">
              <p className="text-xs font-semibold text-cyan-200">🔭 Real Data Shadow</p>
              <p className="mt-0.5 text-xs text-slate-500">使用 Real Connectors 读取真实 Binance/Bybit/OKX 公开 funding 数据。只读，不下单。</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">所有模式均不调用真实订单接口。Kill Switch 阻断所有交易。</p>
        </div>
      </section>
    </PageShell>
  );
}

// ─── Sub-Components ───────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 75 ? "text-emerald-200 border-emerald-400/50 bg-emerald-400/15"
    : score >= 50 ? "text-cyan-200 border-cyan-400/50 bg-cyan-400/15"
    : "text-slate-300 border-slate-700 bg-slate-900";
  return <span className={`inline-flex min-w-11 justify-center border px-2 py-1 text-xs font-semibold tabular-nums ${tone}`}>{score}</span>;
}

function SpreadSourceBadge({ isReal }: { isReal: boolean }) {
  if (isReal) {
    return <span className="border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-200">Real</span>;
  }
  return <span className="border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-400">Mock</span>;
}

function ExchangeHealthBadge({ status }: { status: string }) {
  if (status === "healthy") return <span className="border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-200">Healthy</span>;
  return <span className="border border-red-400/40 bg-red-400/10 px-2 py-0.5 text-xs text-red-200">Down</span>;
}

function PositionCard({ position }: { position: SpreadPaperPosition }) {
  return (
    <div className="border border-slate-800 bg-slate-950/30 px-3 py-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-semibold text-slate-100">{position.canonicalSymbol}</span>
          <span className="ml-2 text-slate-500">{position.shortExchangeId} → {position.longExchangeId}</span>
        </div>
        <span className={`text-xs font-medium ${position.totalPnlUsd >= 0 ? "text-emerald-300" : "text-red-300"}`}>${position.totalPnlUsd.toFixed(2)}</span>
      </div>
      <div className="mt-1 flex gap-3 text-xs text-slate-500">
        <span>Funding: ${position.fundingCollectedUsd.toFixed(4)}</span>
        <span>Spread: {(position.currentSpreadRate * 100).toFixed(4)}%</span>
      </div>
    </div>
  );
}
