"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { StatCard, ExchangeTierBadge, ReadOnlyPill } from "@/components/ui/dashboard";
import { createMockConnectors } from "@/lib/connectors/mocks/createMockConnectors";
import { findCrossExchangeFundingSpreads } from "@/lib/fundingSpread/fundingSpreadEngine";
import { runSpreadPaperTraderStep, createInitialState, generateSpreadPaperTraderReport } from "@/lib/fundingSpreadPaperTrader/spreadPaperTraderEngine";
import { DEFAULT_PAPER_TRADER_CONFIG } from "@/lib/fundingSpreadPaperTrader/spreadPaperTraderTypes";
import { DEFAULT_SPREAD_CONFIG } from "@/lib/fundingSpread/fundingSpreadTypes";
import type { FundingSpreadOpportunity } from "@/lib/fundingSpread/fundingSpreadTypes";
import type { SpreadPaperTraderState, SpreadPaperPosition } from "@/lib/fundingSpreadPaperTrader/spreadPaperTraderTypes";

type SpreadPageData = {
  opportunities: FundingSpreadOpportunity[];
  topOpp: FundingSpreadOpportunity | undefined;
  traderState: SpreadPaperTraderState;
  report: ReturnType<typeof generateSpreadPaperTraderReport>;
  loaded: boolean;
};

const CONNECTORS = createMockConnectors();
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

export default function SpreadOpportunitiesPage() {
  const [data, setData] = useState<SpreadPageData | null>(null);
  const requestRef = useRef(false);

  const loadData = useCallback(async () => {
    if (requestRef.current) return;
    requestRef.current = true;
    try {
      const spreadConfig = { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 };
      const opportunities = await findCrossExchangeFundingSpreads(CONNECTORS, SYMBOLS, spreadConfig);
      const topOpp = opportunities[0];

      const initialState = createInitialState({ ...DEFAULT_PAPER_TRADER_CONFIG, minNetSpreadApy: 0 });
      const symbolsForTrader = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

      const { newState } = await runSpreadPaperTraderStep(
        { binance: CONNECTORS.binance, bybit: CONNECTORS.bybit, okx: CONNECTORS.okx, bitget: CONNECTORS.bitget, gate: CONNECTORS.gate, hyperliquid: CONNECTORS.hyperliquid },
        symbolsForTrader,
        initialState,
        { ...DEFAULT_PAPER_TRADER_CONFIG, minNetSpreadApy: 0 },
      );

      const report = generateSpreadPaperTraderReport(newState);

      setData({
        opportunities,
        topOpp,
        traderState: newState,
        report,
        loaded: true,
      });
    } finally {
      requestRef.current = false;
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <PageShell
      activeHref="/spread-opportunities"
      title="跨所套利"
      description="跨交易所资金费率套利 — Paper Trading / Mock Connectors"
      showRefresh={false}
    >
      {/* ── Safety Banner ── */}
      <section className="border border-amber-800/40 bg-amber-950/20">
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs">
          <span className="font-semibold text-amber-200">Paper Trading</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">Real Orders: <span className="text-red-300 font-medium">Disabled</span></span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">Strategy: Funding Spread</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">Exchanges: Binance, Bybit, OKX, Bitget, Gate, Hyperliquid</span>
          <span className="text-slate-500">|</span>
          <span className="text-yellow-200 font-medium">⚠️ Not live trading — mock data only</span>
        </div>
      </section>

      {/* ── Summary Cards ── */}
      {data ? (
        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="最高净 APY" value={data.topOpp ? `${data.topOpp.netSpreadApy.toFixed(1)}%` : "-"} tone="green" />
          <StatCard label="发现机会" value={String(data.opportunities.length)} tone="cyan" />
          <StatCard label="模拟持仓" value={String(data.report.openPositionCount)} tone="slate" />
          <StatCard label="模拟总 Funding" value={`$${data.report.totalFundingCollectedUsd.toFixed(2)}`} tone={data.report.totalFundingCollectedUsd >= 0 ? "green" : "red"} />
          <StatCard label="最佳配对" value={data.topOpp ? `${data.topOpp.shortExchangeId}-${data.topOpp.longExchangeId}` : "-"} tone="cyan" />
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
        </div>
        <div className="max-h-[400px] overflow-auto">
          <table className="min-w-[1100px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-950 text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-800">
                <th className="px-3 py-2 text-left">Symbol</th>
                <th className="px-3 py-2 text-left">Short Exchange</th>
                <th className="px-3 py-2 text-left">Long Exchange</th>
                <th className="px-3 py-2 text-right">Short Rate</th>
                <th className="px-3 py-2 text-right">Long Rate</th>
                <th className="px-3 py-2 text-right">Spread</th>
                <th className="px-3 py-2 text-right">APY</th>
                <th className="px-3 py-2 text-right">Net APY</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data?.opportunities.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={10}>暂无 spread 机会。</td>
                </tr>
              )}
              {data?.opportunities.map((opp) => (
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
                  <td className="px-3 py-2 text-center"><span className="border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-200">Paper Only</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Paper Trader Panel ── */}
      {data && (
        <section className="grid gap-2 lg:grid-cols-2">
          <div className="border border-slate-800 bg-slate-950/60">
            <div className="border-b border-slate-800 px-4 py-2">
              <h2 className="text-sm font-semibold text-white">模拟仓位</h2>
            </div>
            <div className="p-4 text-xs">
              {data.traderState.openPositions.length === 0 ? (
                <p className="text-slate-500">当前无持仓。</p>
              ) : (
                <div className="space-y-2">
                  {data.traderState.openPositions.map((pos) => (
                    <PositionCard key={pos.id} position={pos} />
                  ))}
                </div>
              )}
              {data.traderState.closedPositions.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-200">
                    已平仓 ({data.traderState.closedPositions.length})
                  </summary>
                  <div className="mt-2 space-y-1">
                    {data.traderState.closedPositions.slice(0, 5).map((pos) => (
                      <div key={pos.id} className="border border-slate-800 bg-slate-950/30 px-3 py-1.5 text-xs">
                        <span className="text-slate-400">{pos.canonicalSymbol}</span>{" "}
                        <span className="text-slate-500">{pos.shortExchangeId} x {pos.longExchangeId}</span>{" "}
                        <span className={pos.totalPnlUsd >= 0 ? "text-emerald-300" : "text-red-300"}>
                          ${pos.totalPnlUsd.toFixed(2)}
                        </span>
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
              <StatCard label="总 PnL" value={`$${data.report.totalPnlUsd.toFixed(2)}`} tone={data.report.totalPnlUsd >= 0 ? "green" : "red"} />
              <StatCard label="Funding 收入" value={`$${data.report.totalFundingCollectedUsd.toFixed(2)}`} tone="cyan" />
              <StatCard label="资本利用率" value={`${data.report.capitalUtilizationPercent.toFixed(1)}%`} tone="slate" />
              <StatCard label="已平仓数" value={String(data.report.closedPositionCount)} tone="slate" />
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
            <li>同一永续合约在不同交易所的 <strong className="text-slate-200">funding rate</strong> 不同</li>
            <li>在 funding rate <strong className="text-emerald-300">较高</strong> 的交易所 <strong className="text-slate-200">做空</strong>（收 funding）</li>
            <li>在 funding rate <strong className="text-emerald-300">较低</strong> 的交易所 <strong className="text-slate-200">做多</strong>（收 funding）</li>
            <li>spread = shortRate - longRate，即每 funding interval 的净收入</li>
          </ul>
          <p className="mt-2"><strong className="text-amber-200">注意：</strong>当前使用 <strong>Mock Connectors</strong>，数据为模拟值，并非真实交易所数据。</p>
          <p>Kill Switch 阻断所有真实订单。不会自动交易。不会连接真实 Bybit / OKX 等交易所 API。</p>
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

function PositionCard({ position }: { position: SpreadPaperPosition }) {
  return (
    <div className="border border-slate-800 bg-slate-950/30 px-3 py-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-semibold text-slate-100">{position.canonicalSymbol}</span>
          <span className="ml-2 text-slate-500">{position.shortExchangeId} → {position.longExchangeId}</span>
        </div>
        <span className={`text-xs font-medium ${position.totalPnlUsd >= 0 ? "text-emerald-300" : "text-red-300"}`}>
          ${position.totalPnlUsd.toFixed(2)}
        </span>
      </div>
      <div className="mt-1 flex gap-3 text-xs text-slate-500">
        <span>Funding: ${position.fundingCollectedUsd.toFixed(4)}</span>
        <span>Spread: {(position.currentSpreadRate * 100).toFixed(4)}%</span>
      </div>
    </div>
  );
}
