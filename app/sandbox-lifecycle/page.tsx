"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { ExchangeBadge, StatCard } from "@/components/ui/dashboard";
import {
  listSandboxLifecycleRecords,
  markSandboxCancelled,
  markSandboxFailed,
  clearSandboxLifecycleRecords,
} from "@/lib/liveAdapters/sandboxOrderLifecycleStore";
import type { SandboxOrderLifecycleRecord } from "@/lib/liveAdapters/sandboxOrderLifecycleTypes";
import { createAuditEvent } from "@/lib/audit/auditStore";
import { createLocalNotification } from "@/lib/notifications/localNotificationStore";

const STATUS_LABELS: Record<string, string> = {
  "sandbox-ready": "就绪",
  "sandbox-submitted": "已提交",
  "sandbox-filled": "已成交",
  "sandbox-cancelled": "已取消",
  "sandbox-partial": "部分成交",
  "sandbox-failed": "已失败",
};
const STATUS_COLORS: Record<string, string> = {
  "sandbox-ready": "text-cyan-300",
  "sandbox-submitted": "text-blue-300",
  "sandbox-filled": "text-emerald-300",
  "sandbox-cancelled": "text-slate-400",
  "sandbox-partial": "text-yellow-200",
  "sandbox-failed": "text-rose-300",
};

export default function SandboxLifecyclePage() {
  const [records, setRecords] = useState<SandboxOrderLifecycleRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(() => {
    let all = listSandboxLifecycleRecords();
    if (statusFilter !== "all") all = all.filter((r) => r.currentStatus === statusFilter);
    setRecords(all);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const all = listSandboxLifecycleRecords();
    return {
      total: all.length,
      submitted: all.filter((r) => r.currentStatus === "sandbox-submitted").length,
      filled: all.filter((r) => r.currentStatus === "sandbox-filled").length,
      cancelled: all.filter((r) => r.currentStatus === "sandbox-cancelled").length,
      failed: all.filter((r) => r.currentStatus === "sandbox-failed").length,
      ready: all.filter((r) => r.currentStatus === "sandbox-ready").length,
    };
  }, [records]);

  const handleCancel = useCallback((id: string) => {
    const rec = records.find((r) => r.id === id);
    if (!rec || rec.currentStatus === "sandbox-cancelled") return;
    markSandboxCancelled(id, "用户取消");
    createAuditEvent({
      eventType: "sandbox_order_mock_cancelled",
      entityType: "sandbox_lifecycle",
      entityId: id,
      symbol: rec.symbol,
      severity: "info",
      message: `Mock Sandbox 已取消: ${rec.symbol}`,
    });
    createLocalNotification({
      type: "system",
      severity: "warning",
      title: "Mock Sandbox 已取消",
      message: `${rec.symbol}`,
      entityType: "sandbox_lifecycle",
      entityId: id,
      symbol: rec.symbol,
    });
    load();
  }, [records, load]);

  const handleFail = useCallback((id: string) => {
    const rec = records.find((r) => r.id === id);
    if (!rec || rec.currentStatus === "sandbox-failed") return;
    markSandboxFailed(id, "手动标记失败");
    createAuditEvent({
      eventType: "sandbox_order_mock_failed",
      entityType: "sandbox_lifecycle",
      entityId: id,
      symbol: rec.symbol,
      severity: "warning",
      message: `Mock Sandbox 已标记失败: ${rec.symbol}`,
    });
    createLocalNotification({
      type: "system",
      severity: "error",
      title: "Mock Sandbox 已失败",
      message: `${rec.symbol}`,
      entityType: "sandbox_lifecycle",
      entityId: id,
      symbol: rec.symbol,
    });
    load();
  }, [records, load]);

  return (
    <PageShell
      activeHref="/sandbox-lifecycle"
      description="Mock Sandbox 生命周期记录 — 展示模拟沙盒订单的状态流转。这些是 Mock 数据，不代表真实交易。"
      eyebrow="Mock Sandbox Lifecycle — Phase 5.3"
      onRefresh={load}
      title="沙盒生命周期"
      updatedAt={null}
    >
      <section className="border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-xs text-yellow-200">
        <p>⚠ 这些是 Mock Sandbox 生命周期记录，不代表真实 testnet 订单或成交。不连接交易所，不发送任何订单。</p>
      </section>

      <section className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="总记录" value={stats.total.toLocaleString()} tone="slate" />
        <StatCard label="就绪" value={stats.ready.toLocaleString()} tone="cyan" />
        <StatCard label="已提交" value={stats.submitted.toLocaleString()} tone="slate" />
        <StatCard label="已成交" value={stats.filled.toLocaleString()} tone="green" />
        <StatCard label="已取消" value={stats.cancelled.toLocaleString()} tone="slate" />
        <StatCard label="已失败" value={stats.failed.toLocaleString()} tone="orange" />
      </section>

      <section className="flex flex-wrap items-center gap-3 border border-slate-800 bg-slate-950/40 px-4 py-3">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <span>状态</span>
          <select className="h-8 border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">全部</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <button className="ml-auto h-8 border border-slate-700 px-3 text-xs text-slate-400 hover:text-rose-300" onClick={() => { clearSandboxLifecycleRecords(); load(); }} type="button">清空记录</button>
      </section>

      <section className="border border-slate-800 bg-slate-950/40">
        <div className="max-h-[600px] overflow-auto">
          <table className="min-w-[1200px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400">
              <tr>
                <Th>创建时间</Th>
                <Th>币种</Th>
                <Th>交易所</Th>
                <Th>当前状态</Th>
                <Th>来源</Th>
                <Th>提交时间</Th>
                <Th>成交时间</Th>
                <Th>状态数</Th>
                <Th>标记</Th>
                <Th align="right">操作</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {records.map((r) => {
                const canCancel = r.currentStatus !== "sandbox-cancelled" && r.currentStatus !== "sandbox-failed";
                return (
                  <tr className="hover:bg-slate-900/70" key={r.id}>
                    <Td>{formatTime(r.createdAt)}</Td>
                    <Td><span className="font-semibold text-slate-100">{r.symbol}</span></Td>
                    <Td><ExchangeBadge label={r.exchangeId} /></Td>
                    <Td><span className={STATUS_COLORS[r.currentStatus] ?? "text-slate-400"}>{STATUS_LABELS[r.currentStatus] ?? r.currentStatus}</span></Td>
                    <Td><span className="text-slate-500">{r.source}</span></Td>
                    <Td>{r.submittedAt ? formatTime(r.submittedAt) : <span className="text-slate-600">-</span>}</Td>
                    <Td>{r.filledAt ? formatTime(r.filledAt) : <span className="text-slate-600">-</span>}</Td>
                    <Td><span className="text-slate-300">{r.resultHistory.length}</span></Td>
                    <Td>
                      {r.warningFlags.length > 0 ? (
                        <span className="max-w-[120px] truncate text-amber-200" title={r.warningFlags.join("; ")}>{r.warningFlags[0]}</span>
                      ) : <span className="text-slate-500">-</span>}
                    </Td>
                    <Td align="right">
                      {canCancel ? (
                        <div className="flex gap-1">
                          <button className="h-7 border border-slate-700 px-2 text-xs text-slate-400 hover:border-rose-400 hover:text-rose-300" onClick={() => handleCancel(r.id)} type="button">取消</button>
                          <button className="h-7 border border-slate-700 px-2 text-xs text-slate-400 hover:border-red-400 hover:text-red-300" onClick={() => handleFail(r.id)} type="button">失败</button>
                        </div>
                      ) : <span className="text-slate-600">-</span>}
                    </Td>
                  </tr>
                );
              })}
              {records.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={10}>
                    暂无 Mock Sandbox 生命周期记录。在「执行队列」中创建。
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
function formatTime(value?: number | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}
