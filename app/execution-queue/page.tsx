"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { ExchangeBadge, StatCard } from "@/components/ui/dashboard";
import { listQueueItems, cancelQueueItem, filterQueueItems } from "@/lib/orders/executionQueueStore";
import type { ExecutionQueueItem } from "@/lib/orders/executionQueueTypes";
import { isKillSwitchEnabled } from "@/lib/safety/safetyStore";
import { buildQueueHealthSummary, expireDueQueueItems } from "@/lib/orders/executionQueueRecovery";

const STATUS_LABELS: Record<string, string> = {
  "queued-preview-only": "队列中",
  cancelled: "已取消",
  expired: "已过期",
};
const STATUS_COLORS: Record<string, string> = {
  "queued-preview-only": "text-cyan-300",
  cancelled: "text-slate-400",
  expired: "text-amber-300",
};
const PRIORITY_LABELS: Record<string, string> = { low: "低", normal: "中", high: "高" };

export default function ExecutionQueuePage() {
  const [items, setItems] = useState<ExecutionQueueItem[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [killSwitch, setKillSwitch] = useState(false);

  const loadItems = useCallback(() => {
    setItems(filterQueueItems({ status: statusFilter }));
    setKillSwitch(isKillSwitchEnabled());
  }, [statusFilter]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const stats = useMemo(() => {
    const all = listQueueItems();
    return {
      total: all.length,
      queued: all.filter((i) => i.status === "queued-preview-only").length,
      cancelled: all.filter((i) => i.status === "cancelled").length,
      expired: all.filter((i) => i.status === "expired").length,
    };
  }, [items]);

  const handleCancel = useCallback((id: string) => {
    const item = items.find((i) => i.id === id);
    if (item && item.status === "queued-preview-only") {
      cancelQueueItem(id);
      loadItems();
    }
  }, [items, loadItems]);

  return (
    <PageShell
      activeHref="/execution-queue"
      description="本地执行队列 — 已确认预览的排队列表。队列不会触发真实订单。"
      eyebrow="Local Queue — Preview Only"
      onRefresh={loadItems}
      title="执行队列"
      updatedAt={null}
    >
      <section className="border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-xs text-yellow-200">
        <p>⚠ 执行队列仅保存本地预览任务，不会触发真实订单。不连接交易所。</p>
      </section>

      {killSwitch && (
        <section className="border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-xs text-rose-200">
          <p>🛑 Kill Switch 已启用 — 无法向队列添加新项目。现有项目可查看和取消。</p>
        </section>
      )}

      <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="队列总数" value={stats.total.toLocaleString()} tone="slate" />
        <StatCard label="待处理" value={stats.queued.toLocaleString()} tone="cyan" />
        <StatCard label="已取消" value={stats.cancelled.toLocaleString()} tone="slate" />
        <StatCard label="已过期" value={stats.expired.toLocaleString()} tone="yellow" />
      </section>

      {/* Queue Health Summary */}
      {(() => {
        const all = listQueueItems();
        const health = buildQueueHealthSummary(all, { killSwitchEnabled: killSwitch, reason: null, enabledBy: "local-user", enabledAt: null, disabledAt: null, updatedAt: 0, source: "local" });
        return (
          <section className="border border-slate-800 bg-slate-950/40 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <span className="text-slate-400">即将过期: <strong className="text-yellow-200">{health.expiringSoon}</strong></span>
                <span className="text-slate-400">可恢复: <strong className="text-emerald-300">{health.recoverable}</strong></span>
                <span className="text-slate-400">已过期: <strong className="text-amber-300">{health.expired}</strong></span>
                {health.warnings.length > 0 && (
                  <span className="max-w-[300px] truncate text-amber-200" title={health.warnings.join("; ")}>
                    ⚠ {health.warnings[0]}
                  </span>
                )}
              </div>
              <button
                className="h-7 border border-slate-700 px-3 text-xs text-slate-400 hover:border-amber-400 hover:text-amber-200"
                onClick={() => {
                  const n = expireDueQueueItems();
                  loadItems();
                }}
                type="button"
              >
                标记到期项为过期
              </button>
            </div>
          </section>
        );
      })()}

      <section className="flex items-center gap-3 border border-slate-800 bg-slate-950/40 px-4 py-3">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <span>状态</span>
          <select className="h-8 border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">全部</option>
            <option value="queued-preview-only">队列中</option>
            <option value="cancelled">已取消</option>
            <option value="expired">已过期</option>
          </select>
        </label>
        <span className="text-xs text-slate-500">共 {items.length} 条</span>
      </section>

      <section className="border border-slate-800 bg-slate-950/40">
        <div className="max-h-[500px] overflow-auto">
          <table className="min-w-[1000px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400">
              <tr>
                <Th>创建时间</Th>
                <Th>币种</Th>
                <Th>策略</Th>
                <Th>优先级</Th>
                <Th>状态</Th>
                <Th>过期时间</Th>
                <Th>来源</Th>
                <Th align="right">操作</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {items.map((item) => {
                const canCancel = item.status === "queued-preview-only";
                return (
                  <tr className="hover:bg-slate-900/70" key={item.id}>
                    <Td>{formatTime(item.createdAt)}</Td>
                    <Td><span className="font-semibold text-slate-100">{item.symbol}</span></Td>
                    <Td><span className="text-slate-400">{item.strategyName}</span></Td>
                    <Td><span className="text-slate-300">{PRIORITY_LABELS[item.priority]}</span></Td>
                    <Td><span className={STATUS_COLORS[item.status] ?? "text-slate-400"}>{STATUS_LABELS[item.status] ?? item.status}</span></Td>
                    <Td>{formatTime(item.expiresAt)}</Td>
                    <Td><span className="text-slate-500">local</span></Td>
                    <Td align="right">
                      <button
                        className="h-7 border border-slate-700 px-2 text-xs text-slate-400 hover:border-rose-400 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!canCancel}
                        onClick={() => canCancel && handleCancel(item.id)}
                        type="button"
                      >
                        {canCancel ? "取消" : "-"}
                      </button>
                    </Td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={8}>
                    暂无队列项目。在「执行中心」确认预览后可加入队列。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </PageShell>
  );
}

function Th({ align = "left", children }: { align?: "left" | "right"; children: React.ReactNode }) {
  return <th className={`whitespace-nowrap px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ align = "left", children }: { align?: "left" | "right"; children: React.ReactNode }) {
  return <td className={`px-3 py-2 align-top tabular-nums ${align === "right" ? "text-right" : "text-left"}`}>{children}</td>;
}
function formatTime(value: number) {
  return new Date(value).toLocaleString();
}
