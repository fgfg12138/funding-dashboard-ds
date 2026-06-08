"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import {
  ExchangeBadge,
  SkeletonStatCards,
  StatCard,
} from "@/components/ui/dashboard";
import type { PaperExecution } from "@/lib/execution/types";
import { listPaperExecutions } from "@/lib/execution/executionStore";
import { summarizePaperPortfolio, type PortfolioSummary } from "@/lib/execution/portfolio";

const TYPE_LABELS: Record<string, string> = {
  "spot-perp": "现货+永续",
  "cross-exchange": "跨所费率差",
  basis: "Basis",
  unknown: "未知",
};

const TYPE_TONES: Record<string, "cyan" | "purple" | "green" | "slate"> = {
  "spot-perp": "cyan",
  "cross-exchange": "purple",
  basis: "green",
  unknown: "slate",
};

export default function PaperPortfolioPage() {
  const [executions, setExecutions] = useState<PaperExecution[]>([]);
  const [loading, setLoading] = useState(true);

  const loadExecutions = useCallback(() => {
    setLoading(true);
    setExecutions(listPaperExecutions());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadExecutions();
  }, [loadExecutions]);

  const summary = useMemo(() => summarizePaperPortfolio(executions), [executions]);

  // Recent executions (up to 10, newest first)
  const recentExecs = useMemo(() => {
    return [...executions]
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, 10);
  }, [executions]);

  return (
    <PageShell
      activeHref="/paper-portfolio"
      description="模拟资产与收益统计 — 基于本地纸上交易数据的只读统计看板。"
      eyebrow="Paper Portfolio"
      loading={loading}
      onRefresh={loadExecutions}
      title="模拟资产"
      updatedAt={null}
    >
      {/* Disclaimer */}
      <section className="border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-200">
        <p className="font-medium">⚠ 模拟估算数据</p>
        <p className="mt-1">
          所有收益为基于年化率的估算值，不代表真实收益。当前不接入交易所、不使用 API Key、不进行 mark-to-market 估值。
          已平仓收益 = estimatedNetRate × (持仓小时 / 8760) × 名义本金。
        </p>
      </section>

      {/* Stat cards */}
      {loading ? (
        <SkeletonStatCards count={6} />
      ) : (
        <section className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="当前开仓" value={summary.openExecutions.toLocaleString()} tone="cyan" />
          <StatCard label="已平仓" value={summary.closedExecutions.toLocaleString()} tone="green" />
          <StatCard label="总执行次数" value={summary.totalExecutions.toLocaleString()} tone="slate" />
          <StatCard label="模拟占用资金" value={formatUsd(summary.openNotionalUsd)} tone="orange" />
          <StatCard label="已平仓估算收益" value={formatUsd(summary.estimatedClosedPnL)} tone={summary.estimatedClosedPnL >= 0 ? "green" : "red"} />
          <StatCard label="平均净年化" value={formatPercent(summary.averageNetAnnualizedRate)} tone={summary.averageNetAnnualizedRate >= 10 ? "cyan" : "yellow"} />
        </section>
      )}

      {/* Costs summary */}
      <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="总交易次数" value={summary.totalExecutions.toLocaleString()} tone="slate" />
        <StatCard label="已平仓名义本金" value={formatUsd(summary.closedNotionalUsd)} tone="slate" />
        <StatCard label="平均手续费" value={formatUsd(summary.averageFees)} tone="slate" />
        <StatCard label="平均滑点" value={formatUsd(summary.averageSlippage)} tone="slate" />
      </section>

      {/* Distribution cards */}
      <section className="grid gap-3 xl:grid-cols-2">
        {/* By type */}
        <section className="border border-slate-800 bg-slate-950/40">
          <div className="border-b border-slate-800 px-4 py-3">
            <h2 className="text-base font-semibold text-white">类型分布</h2>
          </div>
          {executions.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">暂无模拟交易数据。</div>
          ) : (
            <div className="divide-y divide-slate-800">
              {Object.entries(summary.byType).map(([type, count]) => (
                <div className="flex items-center justify-between px-4 py-2.5 text-sm" key={type}>
                  <span className="text-slate-300">{TYPE_LABELS[type] ?? type}</span>
                  <span className="tabular-nums text-slate-100">{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* By exchange */}
        <section className="border border-slate-800 bg-slate-950/40">
          <div className="border-b border-slate-800 px-4 py-3">
            <h2 className="text-base font-semibold text-white">交易所分布</h2>
          </div>
          {executions.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">暂无模拟交易数据。</div>
          ) : (
            <div className="divide-y divide-slate-800">
              {Object.entries(summary.byExchange)
                .sort(([, a], [, b]) => b - a)
                .map(([exchange, count]) => (
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm" key={exchange}>
                    <ExchangeBadge label={exchange} />
                    <span className="tabular-nums text-slate-100">{count.toLocaleString()}</span>
                  </div>
                ))}
            </div>
          )}
        </section>
      </section>

      {/* Recent executions */}
      <section className="border border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-base font-semibold text-white">最近模拟执行记录</h2>
          <span className="text-xs text-slate-500">最多 10 条</span>
        </div>
        {recentExecs.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            暂无记录。前往「执行中心」开始纸上交易。
          </div>
        ) : (
          <div className="max-h-[400px] overflow-auto">
            <table className="min-w-[900px] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400">
                <tr>
                  <Th>币种</Th>
                  <Th>类型</Th>
                  <Th>交易所</Th>
                  <Th align="right">年化</Th>
                  <Th align="right">净年化</Th>
                  <Th>状态</Th>
                  <Th>开仓时间</Th>
                  <Th>平仓时间</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {recentExecs.map((exec) => (
                  <tr className="hover:bg-slate-900/70" key={exec.id}>
                    <Td><span className="font-semibold text-slate-100">{exec.symbol}</span></Td>
                    <Td><span className="text-slate-300">{TYPE_LABELS[exec.opportunityType] ?? exec.opportunityType}</span></Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {exec.exchanges.map((ex) => <ExchangeBadge key={ex} label={ex} />)}
                      </div>
                    </Td>
                    <Td align="right"><span className="text-emerald-300">{exec.estimatedAnnualizedRate.toFixed(2)}%</span></Td>
                    <Td align="right">
                      <span className={exec.estimatedNetRate >= 10 ? "text-emerald-300" : exec.estimatedNetRate >= 0 ? "text-cyan-300" : "text-rose-300"}>
                        {exec.estimatedNetRate.toFixed(2)}%
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge status={exec.status} />
                    </Td>
                    <Td>{formatTime(exec.openedAt)}</Td>
                    <Td>{formatTime(exec.closedAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageShell>
  );
}

/* ── Mini components ──────────────────────────────────── */

function Th({ align = "left", children }: { align?: "left" | "right"; children: React.ReactNode }) {
  return <th className={`whitespace-nowrap px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}

function Td({ align = "left", children }: { align?: "left" | "right"; children: React.ReactNode }) {
  return <td className={`px-3 py-2 align-top tabular-nums ${align === "right" ? "text-right" : "text-left"}`}>{children}</td>;
}

function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    opened: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
    closed: "border-slate-600 bg-slate-800 text-slate-300",
    pending: "border-yellow-400/40 bg-yellow-400/10 text-yellow-200",
    failed: "border-rose-400/40 bg-rose-400/10 text-rose-200",
  };
  const label: Record<string, string> = {
    opened: "开仓",
    closed: "已平仓",
    pending: "待执行",
    failed: "失败",
  };
  return <span className={`border px-2 py-0.5 text-xs ${tone[status] ?? "border-slate-700 bg-slate-900 text-slate-300"}`}>{label[status] ?? status}</span>;
}

function formatTime(value?: number | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatUsd(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  return Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 2, style: "currency" }).format(value);
}

function formatPercent(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  return `${value.toFixed(2)}%`;
}
