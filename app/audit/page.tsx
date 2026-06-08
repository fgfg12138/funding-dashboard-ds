"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { ExchangeBadge, StatCard } from "@/components/ui/dashboard";
import { listAuditEvents, filterAuditEvents, clearAuditEvents } from "@/lib/audit/auditStore";
import type { AuditEvent, AuditSeverity } from "@/lib/audit/auditTypes";

const SEVERITY_LABELS: Record<AuditSeverity, string> = { info: "信息", warning: "警告", blocked: "拦截", error: "错误" };
const SEVERITY_COLORS: Record<AuditSeverity, string> = {
  info: "text-slate-300",
  warning: "text-yellow-200",
  blocked: "text-rose-300",
  error: "text-red-300",
};
const EVENT_LABELS: Record<string, string> = {
  order_preview_created: "创建预览",
  order_preview_closed: "关闭预览",
  order_confirmation_created: "确认成功",
  order_confirmation_rejected: "确认拒绝",
  risk_blocked: "风控拦截",
  paper_execution_created: "模拟开仓",
  paper_execution_closed: "模拟平仓",
  execution_queue_enqueued: "入队",
  execution_queue_cancelled: "取消队列",
  execution_queue_expired: "队列过期",
  kill_switch_enabled: "Kill Switch 开启",
  kill_switch_disabled: "Kill Switch 关闭",
};

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSev, setFilterSev] = useState<string>("all");

  const loadEvents = useCallback(() => {
    let filtered = listAuditEvents();
    if (filterType !== "all") {
      filtered = filtered.filter((e) => e.eventType === filterType);
    }
    if (filterSev !== "all") {
      filtered = filtered.filter((e) => e.severity === filterSev);
    }
    setEvents(filtered);
  }, [filterType, filterSev]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const stats = useMemo(() => {
    const all = listAuditEvents();
    return {
      total: all.length,
      blocked: all.filter((e) => e.severity === "blocked").length,
      warning: all.filter((e) => e.severity === "warning").length,
      confirmations: all.filter((e) => e.eventType === "order_confirmation_created").length,
      previews: all.filter((e) => e.eventType === "order_preview_created").length,
    };
  }, [events]);

  return (
    <PageShell
      activeHref="/audit"
      description="本地审计日志 — 记录半自动交易流程中的关键动作。日志仅为本地记录，不代表真实交易。"
      eyebrow="Local Audit — Preview Only"
      onRefresh={loadEvents}
      title="审计日志"
      updatedAt={null}
    >
      <section className="border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-xs text-yellow-200">
        <p>⚠ 日志仅为本地审计记录，不代表真实成交记录。当前全部为预览和模拟操作。</p>
      </section>

      <section className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="总事件" value={stats.total.toLocaleString()} tone="slate" />
        <StatCard label="风控拦截" value={stats.blocked.toLocaleString()} tone="red" />
        <StatCard label="警告" value={stats.warning.toLocaleString()} tone="yellow" />
        <StatCard label="确认成功" value={stats.confirmations.toLocaleString()} tone="green" />
        <StatCard label="预览次数" value={stats.previews.toLocaleString()} tone="cyan" />
        <StatCard label="数据来源" value="本地 localStorage" tone="slate" />
      </section>

      <section className="flex flex-wrap items-center gap-3 border border-slate-800 bg-slate-950/40 px-4 py-3">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <span>事件类型</span>
          <select className="h-8 border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">全部</option>
            {Object.entries(EVENT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <span>等级</span>
          <select className="h-8 border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100" value={filterSev} onChange={(e) => setFilterSev(e.target.value)}>
            <option value="all">全部</option>
            {Object.entries(SEVERITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <button className="ml-auto h-8 border border-slate-700 px-3 text-xs text-slate-400 hover:text-slate-100" onClick={() => { clearAuditEvents(); loadEvents(); }} type="button">
          清空日志
        </button>
      </section>

      <section className="border border-slate-800 bg-slate-950/40">
        <div className="max-h-[600px] overflow-auto">
          <table className="min-w-[1200px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400">
              <tr>
                <Th>时间</Th>
                <Th>类型</Th>
                <Th>行为者</Th>
                <Th>币种</Th>
                <Th>策略</Th>
                <Th>等级</Th>
                <Th>消息</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {events.map((ev) => (
                <tr className="hover:bg-slate-900/70" key={ev.id}>
                  <Td>{formatTime(ev.timestamp)}</Td>
                  <Td><span className="text-slate-300">{EVENT_LABELS[ev.eventType] ?? ev.eventType}</span></Td>
                  <Td><span className="text-slate-400">{ev.actor}</span></Td>
                  <Td><span className="font-semibold text-slate-100">{ev.symbol ?? "-"}</span></Td>
                  <Td><span className="text-slate-400">{ev.strategyName ?? "-"}</span></Td>
                  <Td><span className={SEVERITY_COLORS[ev.severity]}>{SEVERITY_LABELS[ev.severity]}</span></Td>
                  <Td><span className="max-w-[400px] truncate text-slate-300" title={ev.message}>{ev.message}</span></Td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={7}>
                    暂无审计日志记录。
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

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th className={`whitespace-nowrap px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <td className={`px-3 py-2 align-top tabular-nums ${align === "right" ? "text-right" : "text-left"}`}>{children}</td>;
}
function formatTime(value: number) {
  return new Date(value).toLocaleString();
}
