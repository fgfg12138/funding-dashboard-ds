"use client";

import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import {
  ExchangeBadge,
  RiskBadge,
  ScoreBadge,
  SkeletonRows,
  StatCard,
} from "@/components/ui/dashboard";
import type { UnifiedOpportunity } from "@/lib/opportunities/types";
import type { PaperExecution } from "@/lib/execution/types";
import {
  createPaperExecution,
  closePaperExecution,
  listOpenExecutions,
  listClosedExecutions,
} from "@/lib/execution/executionStore";
import { createPaperExecutionFromOpportunity, estimateExecutionReturns } from "@/lib/execution/executionEngine";
import { scoreOpportunity, type ScorableOpportunity } from "@/lib/opportunity/scoring";
import { evaluateRiskGate } from "@/lib/risk/riskGate";
import { buildAccountRiskContext, type AccountRiskContext } from "@/lib/risk/accountRiskContext";
import { createPrivateAccountAdapter } from "@/lib/exchangeAdapters/privateAccountAdapter";
import { getActivePaperTemplate } from "@/lib/execution/paperStrategyStore";
import type { PaperStrategyTemplate } from "@/lib/execution/paperStrategyTypes";

type ApiResponse<T> = {
  data: T;
  errors?: string[];
  stale?: boolean;
  updatedAt: number;
};

export default function ExecutionPage() {
  const [opportunities, setOpportunities] = useState<UnifiedOpportunity[]>([]);
  const [loadingOpps, setLoadingOpps] = useState(true);
  const [openExecutions, setOpenExecutions] = useState<PaperExecution[]>([]);
  const [closedExecutions, setClosedExecutions] = useState<PaperExecution[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<PaperStrategyTemplate | null>(null);
  const [accountCtx, setAccountCtx] = useState<AccountRiskContext | null>(null);
  const [search, setSearch] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  // Load opportunities from the existing API
  const loadOpps = useCallback(async () => {
    setLoadingOpps(true);
    try {
      const res = await fetch("/api/opportunities", { cache: "no-store" });
      const payload = (await res.json()) as ApiResponse<UnifiedOpportunity[]>;
      setOpportunities(payload.data ?? []);
      setErrors(payload.errors ?? []);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "机会数据加载失败"]);
    } finally {
      setLoadingOpps(false);
    }
  }, []);

  // Load paper executions from localStorage
  const loadExecutions = useCallback(() => {
    setOpenExecutions(listOpenExecutions());
    setClosedExecutions(listClosedExecutions());
    setActiveTemplate(getActivePaperTemplate());
  }, []);

  // Load mock account snapshots
  const loadAccountSnapshots = useCallback(async () => {
    try {
      const results = await Promise.allSettled(
        (["Binance", "OKX", "Bybit"] as const).map((ex) =>
          createPrivateAccountAdapter(ex).getSnapshot(),
        ),
      );
      const snapshots = results
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r as PromiseFulfilledResult<any>).value);
      setAccountCtx(buildAccountRiskContext(snapshots));
    } catch {
      // Silently fail — risk gate will warn
    }
  }, []);

  useEffect(() => {
    void loadOpps();
    loadExecutions();
    void loadAccountSnapshots();
  }, [loadOpps, loadExecutions, loadAccountSnapshots]);

  // Filtered opportunities — sorted by scoring engine score descending
  const filteredOpps = useMemo(() => {
    const q = search.trim().toUpperCase();
    const tpl = activeTemplate;
    const defaultNotional = tpl?.defaultNotionalUsd ?? 1000;
    const feeRate = tpl?.feeRate ?? 0.001;
    const slippageRate = tpl?.slippageRate ?? 0.0005;

    const filtered = opportunities
      .filter((o) => (q ? o.symbol.includes(q) || o.base.includes(q) : true))
      .filter((o) => o.score >= 40);

    // Filter by template's target opportunity types
    const withTypeFilter = tpl
      ? filtered.filter((o) => {
          const execType = o.opportunityType === "CrossExchange" ? "cross-exchange" : o.opportunityType === "SpotPerp" ? "spot-perp" : o.opportunityType === "Basis" ? "basis" : "unknown";
          return (tpl.targetOpportunityTypes as string[]).includes(execType);
        })
      : filtered;

    // Map to scorable format and sort by scoring score
    return withTypeFilter
      .map((opp) => {
        const scoreResult = scoreOpportunity({
          id: opp.id,
          symbol: opp.symbol,
          annualizedRate: opp.annualizedRate,
          fundingRate: opp.fundingRate,
          estimatedNetRate: opp.annualizedRate - (opp.annualizedRate > 0 ? 2 : 0),
          volume24h: opp.volume24h,
          openInterestUsd: opp.openInterestUsd,
          riskTags: opp.riskTags,
          hasSecondaryExchange: Boolean(opp.secondaryExchange),
        });
        const estimate = estimateExecutionReturns({
          opportunityType: (opp.opportunityType === "CrossExchange" ? "cross-exchange" : opp.opportunityType === "SpotPerp" ? "spot-perp" : opp.opportunityType === "Basis" ? "basis" : "unknown") as "cross-exchange" | "spot-perp" | "basis",
          annualizedRate: opp.annualizedRate,
          fundingRate: opp.fundingRate ?? 0,
          notionalUsd: defaultNotional,
          fees: 2 * (feeRate * defaultNotional),
          slippage: 2 * (slippageRate * defaultNotional),
        });
        const gateResult = evaluateRiskGate({
          symbol: opp.symbol,
          riskTags: opp.riskTags,
          notionalUsd: defaultNotional,
          scoringResult: scoreResult,
          estimateResult: estimate,
          openExecutions,
          accountRiskContext: accountCtx ?? undefined,
          config: {
            ...(tpl
              ? {
                  minScore: tpl.minScore,
                  maxRiskLevel: tpl.maxRiskLevel,
                  minAnnualizedNetRate: tpl.minAnnualizedNetRate,
                  maxOpenExecutions: tpl.maxOpenExecutions,
                  maxOpenNotionalUsd: tpl.maxOpenNotionalUsd,
                  maxSymbolExposureUsd: tpl.maxSymbolExposureUsd,
                  blockRiskTags: tpl.blockRiskTags,
                }
              : {}),
            includeAccountSnapshotRisk: Boolean(accountCtx),
          },
        });
        return { opp, scoreResult, estimate, gateResult };
      })
      .sort((a, b) => b.scoreResult.score - a.scoreResult.score);
  }, [opportunities, search, openExecutions, activeTemplate, accountCtx]);

  // Stats
  const stats = useMemo(() => ({
    open: openExecutions.length,
    closed: closedExecutions.length,
    total: openExecutions.length + closedExecutions.length,
    avgAnnualized:
      openExecutions.length > 0
        ? openExecutions.reduce((s, e) => s + e.estimatedAnnualizedRate, 0) / openExecutions.length
        : 0,
  }), [openExecutions, closedExecutions]);

  // Open a paper execution via engine + store
  const handleOpen = useCallback((opp: UnifiedOpportunity) => {
    const execution = createPaperExecutionFromOpportunity(opp);
    createPaperExecution(execution);
    loadExecutions();
  }, [loadExecutions]);

  // Close a paper execution
  const handleClose = useCallback((id: string) => {
    closePaperExecution({ id });
    loadExecutions();
  }, [loadExecutions]);

  return (
    <PageShell
      activeHref="/execution"
      description="纸上交易 — 基于当前套利机会进行模拟开平仓。不连接交易所，不使用 API Key，不发送真实订单。"
      eyebrow="Paper Trading"
      loading={loadingOpps}
      onRefresh={() => { void loadOpps(); loadExecutions(); void loadAccountSnapshots(); }}
      title="执行中心"
      updatedAt={null}
    >
      {/* Mode status cards */}
      <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="模拟开仓" value={stats.open.toLocaleString()} tone="cyan" />
        <StatCard label="已平仓" value={stats.closed.toLocaleString()} tone="slate" />
        <StatCard label="总模拟交易" value={stats.total.toLocaleString()} tone="green" />
        <StatCard label="开仓平均年化" value={stats.avgAnnualized > 0 ? `${stats.avgAnnualized.toFixed(1)}%` : "-"} tone="yellow" />
      </section>

      {/* Link to portfolio */}
      <section className="flex items-center justify-between gap-2">
        <div className="text-xs text-slate-500">
          {activeTemplate ? (
            <span>当前策略：<strong className="text-cyan-300">{activeTemplate.name}</strong></span>
          ) : (
            <span>默认模拟策略（未启用模板）</span>
          )}
        </div>
        <a
          className="inline-flex h-8 items-center gap-1 border border-cyan-400/50 bg-cyan-400/10 px-3 text-xs font-medium text-cyan-100 hover:bg-cyan-400/20"
          href="/paper-portfolio"
        >
          查看模拟资产 →
        </a>
      </section>

      {/* Account risk context info */}
      {accountCtx && (
        <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Mock 账户总资产" value={formatUsd(accountCtx.totalUsdValue)} tone="cyan" />
          <StatCard label="Mock 可用 USDT" value={formatUsd(accountCtx.availableUsdBalance)} tone="green" />
          <StatCard label="Mock 持仓敞口" value={formatUsd(accountCtx.totalPositionExposureUsd)} tone="yellow" />
          <StatCard label="账户风控来源" value={accountCtx.source} tone="slate" />
        </section>
      )}

      {/* Read-only warning banner */}
      <section className="border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-200">
        <p className="font-medium">📋 纸上交易模式 — 纯模拟，零风险</p>
        <p className="mt-1">不连接交易所 · 不使用 API Key · 不发送真实订单 · 所有数据仅存储在浏览器本地</p>
      </section>

      {/* Executable opportunities list */}
      <section className="border border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-base font-semibold text-white">可执行机会</h2>
          <span className="text-xs text-slate-500">{filteredOpps.length} 条机会（评分 ≥ 40）</span>
        </div>

        <div className="border-b border-slate-800 px-4 py-2">
          <label className="relative block max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              className="h-8 w-full border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
              placeholder="搜索币种..."
              value={search}
              onChange={(e) => setSearch(e.target.value.toUpperCase())}
            />
          </label>
        </div>

        {errors.length > 0 && (
          <div className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
            {errors.join("; ")}
          </div>
        )}

        <div className="max-h-[400px] overflow-auto">
          <table className="min-w-[1200px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400">
              <tr>
                <Th>币种</Th>
                <Th>类型</Th>
                <Th>方向</Th>
                <Th>交易所</Th>
                <Th>风控</Th>
                <Th>等级</Th>
                <Th>风险</Th>
                <Th>提示</Th>
                <Th align="right">预估年化</Th>
                <Th align="right">手续费</Th>
                <Th align="right">滑点</Th>
                <Th align="right">净年化</Th>
                <Th>标签</Th>
                <Th align="right">评分</Th>
                <Th align="right" className="w-32">操作</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loadingOpps && filteredOpps.length === 0 ? (
                <SkeletonRows colSpan={15} rowCount={4} />
              ) : null}
              {filteredOpps.map(({ opp, scoreResult: sr, estimate, gateResult }) => {
                const alreadyOpen = openExecutions.some((e) => e.opportunityId === opp.id);
                const allowedToOpen = gateResult.allowed && !alreadyOpen;
                return (
                  <tr className="hover:bg-slate-900/70" key={opp.id}>
                    <Td>
                      <span className="font-semibold text-slate-100">{opp.symbol}</span>
                    </Td>
                    <Td>
                      <OpportunityTypeBadge type={opp.opportunityType} />
                    </Td>
                    <Td>
                      <span className="line-clamp-2 max-w-[140px] text-slate-300" title={opp.direction}>
                        {opp.direction}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <ExchangeBadge label={opp.primaryExchange} />
                        {opp.secondaryExchange && <ExchangeBadge label={opp.secondaryExchange} />}
                      </div>
                    </Td>
                    <Td>
                      <GateStatusBadge severity={gateResult.severity} />
                    </Td>
                    <Td>
                      <ScoringBadge grade={sr.grade} riskLevel={sr.riskLevel} />
                    </Td>
                    <Td>
                      <RiskLevelBadge level={sr.riskLevel} />
                    </Td>
                    <Td>
                      {sr.warnings.length > 0 ? (
                        <span className="max-w-[120px] truncate text-xs text-amber-300" title={sr.warnings.join("; ")}>
                          {sr.warnings[0]}
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </Td>
                    <Td align="right">
                      <span className={opp.annualizedRate >= 90 ? "text-orange-300" : "text-emerald-300"}>
                        {opp.annualizedRate.toFixed(2)}%
                      </span>
                    </Td>
                    <Td align="right"><span className="text-slate-400">{formatUsd(estimate.fees)}</span></Td>
                    <Td align="right"><span className="text-slate-400">{formatUsd(estimate.slippage)}</span></Td>
                    <Td align="right">
                      <span className={estimate.annualizedNetRate >= 10 ? "text-emerald-300" : estimate.annualizedNetRate >= 0 ? "text-cyan-300" : "text-rose-300"}>
                        {estimate.annualizedNetRate.toFixed(2)}%
                      </span>
                    </Td>
                    <Td>
                      {opp.riskTags.length > 0 ? (
                        <div className="flex max-w-[120px] flex-wrap gap-1">
                          {opp.riskTags.slice(0, 2).map((tag) => (
                            <RiskBadge key={tag} label={tag} />
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </Td>
                    <Td align="right">
                      <ScoreBadge score={sr.score} />
                    </Td>
                    <Td align="right">
                      <button
                        className="h-7 border border-cyan-400/50 bg-cyan-400/10 px-2 text-xs font-medium text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!allowedToOpen}
                        onClick={() => handleOpen(opp)}
                        title={!gateResult.allowed ? gateResult.reasonCodes[0] : alreadyOpen ? "已开仓" : "模拟开仓"}
                        type="button"
                      >
                        {alreadyOpen ? "已开仓" : gateResult.allowed ? "模拟开仓" : "拦截"}
                      </button>
                    </Td>
                  </tr>
                );
              })}
              {!loadingOpps && filteredOpps.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={15}>
                    暂无符合条件的可执行机会。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Current paper executions */}
      <section className="border border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-base font-semibold text-white">当前模拟仓位</h2>
          <span className="text-xs text-slate-500">{openExecutions.length} 个开仓</span>
        </div>
        <PaperExecutionsTable
          executions={openExecutions}
          actions
          onClose={handleClose}
        />
      </section>

      {/* History */}
      <section className="border border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-base font-semibold text-white">模拟历史记录</h2>
          <span className="text-xs text-slate-500">{closedExecutions.length} 条记录</span>
        </div>
        <PaperExecutionsTable
          executions={closedExecutions}
          actions={false}
          onClose={() => {}}
        />
      </section>
    </PageShell>
  );
}

/* ── Paper Executions Table ───────────────────────────── */

function PaperExecutionsTable({
  executions,
  actions,
  onClose,
}: {
  executions: PaperExecution[];
  actions: boolean;
  onClose: (id: string) => void;
}) {
  if (executions.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-slate-500">
        {actions ? "暂无开仓的模拟仓位。在上方机会列表点击「模拟开仓」开始。" : "暂无历史记录。"}
      </div>
    );
  }

  return (
    <div className="max-h-[400px] overflow-auto">
      <table className="min-w-[1000px] border-collapse text-left text-xs">
        <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400">
          <tr>
            <Th>币种</Th>
            <Th>类型</Th>
            <Th>方向</Th>
            <Th>交易所</Th>
            <Th align="right">年化</Th>
            <Th align="right">手续费</Th>
            <Th align="right">滑点</Th>
            <Th align="right">净年化</Th>
            <Th>风险</Th>
            <Th>开仓时间</Th>
            {actions && <Th align="right">操作</Th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {executions.map((exec) => (
            <tr className="hover:bg-slate-900/70" key={exec.id}>
              <Td><span className="font-semibold text-slate-100">{exec.symbol}</span></Td>
              <Td><ExecutionTypeBadge type={exec.opportunityType} /></Td>
              <Td><span className="line-clamp-2 max-w-[200px] text-slate-300" title={exec.sideDescription}>{exec.sideDescription}</span></Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {exec.exchanges.map((ex) => <ExchangeBadge key={ex} label={ex} />)}
                </div>
              </Td>
              <Td align="right">
                <span className={exec.estimatedAnnualizedRate >= 90 ? "text-orange-300" : "text-emerald-300"}>
                  {exec.estimatedAnnualizedRate.toFixed(2)}%
                </span>
              </Td>
              <Td align="right"><span className="text-slate-400">{formatUsd(exec.estimatedFees)}</span></Td>
              <Td align="right"><span className="text-slate-400">{formatUsd(exec.estimatedSlippage)}</span></Td>
              <Td align="right">
                <span className={exec.estimatedNetRate >= 10 ? "text-emerald-300" : exec.estimatedNetRate >= 0 ? "text-cyan-300" : "text-rose-300"}>
                  {exec.estimatedNetRate.toFixed(2)}%
                </span>
              </Td>
              <Td>
                {exec.riskTags.length > 0 ? (
                  <div className="flex max-w-[160px] flex-wrap gap-1">
                    {exec.riskTags.slice(0, 2).map((tag) => <RiskBadge key={tag} label={tag} />)}
                  </div>
                ) : (
                  <span className="text-slate-500">-</span>
                )}
              </Td>
              <Td>{formatTime(exec.openedAt)}</Td>
              {actions && (
                <Td align="right">
                  <button
                    className="h-7 border border-rose-400/50 bg-rose-400/10 px-2 text-xs font-medium text-rose-200 hover:bg-rose-400/20"
                    onClick={() => onClose(exec.id)}
                    type="button"
                  >
                    模拟平仓
                  </button>
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Mini components ──────────────────────────────────── */

function Th({ align = "left", children, className }: { align?: "left" | "right"; children: React.ReactNode; className?: string }) {
  return (
    <th className={`whitespace-nowrap px-3 py-2 ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}>
      {children}
    </th>
  );
}

function Td({ align = "left", children }: { align?: "left" | "right"; children: React.ReactNode }) {
  return <td className={`px-3 py-2 align-top tabular-nums ${align === "right" ? "text-right" : "text-left"}`}>{children}</td>;
}

/** Badge for UnifiedOpportunity types (CrossExchange / SpotPerp / Basis). */
function OpportunityTypeBadge({ type }: { type: string }) {
  const tone: Record<string, string> = {
    CrossExchange: "border-purple-400/50 bg-purple-400/10 text-purple-200",
    SpotPerp: "border-cyan-400/50 bg-cyan-400/10 text-cyan-200",
    Basis: "border-emerald-400/50 bg-emerald-400/10 text-emerald-200",
  };
  const label: Record<string, string> = {
    CrossExchange: "跨所费率差",
    SpotPerp: "现货+永续",
    Basis: "Basis",
  };
  return (
    <span className={`border px-2 py-0.5 text-xs ${tone[type] ?? "border-slate-700 bg-slate-900 text-slate-300"}`}>
      {label[type] ?? type}
    </span>
  );
}

/** Badge for PaperExecution types (cross-exchange / spot-perp / basis). */
function ExecutionTypeBadge({ type }: { type: string }) {
  const tone: Record<string, string> = {
    "cross-exchange": "border-purple-400/50 bg-purple-400/10 text-purple-200",
    "spot-perp": "border-cyan-400/50 bg-cyan-400/10 text-cyan-200",
    basis: "border-emerald-400/50 bg-emerald-400/10 text-emerald-200",
  };
  const label: Record<string, string> = {
    "cross-exchange": "跨所费率差",
    "spot-perp": "现货+永续",
    basis: "Basis",
  };
  return (
    <span className={`border px-2 py-0.5 text-xs ${tone[type] ?? "border-slate-700 bg-slate-900 text-slate-300"}`}>
      {label[type] ?? type}
    </span>
  );
}

/** Badge combining grade and score. */
function ScoringBadge({ grade, riskLevel }: { grade: string; riskLevel: string }) {
  const gradeColors: Record<string, string> = {
    A: "border-emerald-400/50 bg-emerald-400/15 text-emerald-200",
    B: "border-cyan-400/50 bg-cyan-400/15 text-cyan-200",
    C: "border-yellow-400/50 bg-yellow-400/15 text-yellow-100",
    D: "border-slate-700 bg-slate-900 text-slate-300",
  };
  return <span className={`inline-flex min-w-8 justify-center border px-2 py-0.5 text-xs font-semibold ${gradeColors[grade] ?? gradeColors["D"]}`}>{grade}</span>;
}

/** Badge for risk gate status. */
function GateStatusBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    info: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
    warning: "border-yellow-400/40 bg-yellow-400/10 text-yellow-100",
    blocked: "border-rose-400/40 bg-rose-400/10 text-rose-200",
  };
  const labels: Record<string, string> = {
    info: "允许",
    warning: "警告",
    blocked: "拦截",
  };
  return <span className={`border px-2 py-0.5 text-xs ${colors[severity] ?? colors.info}`}>{labels[severity] ?? severity}</span>;
}

/** Badge for risk level. */
function RiskLevelBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    low: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    medium: "border-yellow-400/30 bg-yellow-400/10 text-yellow-100",
    high: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  };
  const labels: Record<string, string> = {
    low: "低",
    medium: "中",
    high: "高",
  };
  return <span className={`border px-2 py-0.5 text-xs ${colors[level] ?? colors.low}`}>{labels[level] ?? level}</span>;
}

function formatTime(value?: number | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatUsd(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  return Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 2, style: "currency" }).format(value);
}
