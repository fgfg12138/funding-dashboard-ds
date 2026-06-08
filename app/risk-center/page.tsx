"use client";

/**
 * Risk Center — Phase Recovery R1
 *
 * Aggregates safety controls, risk rules, audit risk events,
 * local notifications, and execution queue health into one dashboard.
 *
 * Read-only — does NOT modify any store.
 * No API calls, no exchange access, no testnet.
 */

import { useMemo } from "react";
import { PageShell } from "@/components/PageShell";
import { getSafetyState } from "@/lib/safety/safetyStore";
import { listQueueItems } from "@/lib/orders/executionQueueStore";
import { listAuditEvents } from "@/lib/audit/auditStore";
import { listLocalNotifications, unreadLocalNotificationCount } from "@/lib/notifications/localNotificationStore";
import type { AuditSeverity } from "@/lib/audit/auditTypes";

// ─── Status Card ─────────────────────────────────────────

function StatusCard({ label, value, className }: { label: string; value: string | number; className?: string }) {
  return (
    <div className="rounded border border-slate-700 bg-slate-900/50 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${className ?? "text-slate-100"}`}>{value}</p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────

export default function RiskCenterPage() {
  const safety = useMemo(() => getSafetyState(), []);
  const queueItems = useMemo(() => listQueueItems(), []);
  const auditEvents = useMemo(() => listAuditEvents(), []);
  const notifications = useMemo(() => listLocalNotifications(), []);
  const unreadCount = useMemo(() => unreadLocalNotificationCount(), []);

  const activeQueueCount = useMemo(() => queueItems.filter((i) => i.status === "queued-preview-only").length, [queueItems]);
  const riskBlockedEvents = useMemo(() => auditEvents.filter((e) => e.severity === "blocked").length, [auditEvents]);
  const riskWarningEvents = useMemo(() => auditEvents.filter((e) => e.severity === "warning").length, [auditEvents]);
  const riskBlockedAudits = useMemo(() => auditEvents.filter((e) => e.eventType === "risk_blocked" || e.eventType === "sandbox_safety_blocked").length, [auditEvents]);

  const recentRiskEvents = useMemo(
    () =>
      auditEvents
        .filter((e) => ["risk_blocked", "kill_switch_enabled", "kill_switch_disabled", "sandbox_safety_blocked"].includes(e.eventType))
        .slice(0, 10),
    [auditEvents],
  );

  return (
    <PageShell activeHref="/risk-center" title="风险中心" description="Central risk dashboard — read-only, no exchange access">
      <div className="space-y-6 p-4">
        {/* Section 1: System Status */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-300">系统状态</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatusCard label="当前模式" value="半自动交易" className="text-cyan-400" />
            <StatusCard label="Paper Trading" value={queueItems.length > 0 ? "活跃" : "空闲"} className={queueItems.length > 0 ? "text-green-400" : "text-slate-400"} />
            <StatusCard label="Queue 数量" value={activeQueueCount} className="text-blue-400" />
            <StatusCard
              label="Kill Switch"
              value={safety.killSwitchEnabled ? "已启用" : "已禁用"}
              className={safety.killSwitchEnabled ? "text-red-400" : "text-green-400"}
            />
          </div>
        </div>

        {/* Section 2: Risk Event Stats */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-300">风险事件统计</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            <StatusCard label="Blocked 事件" value={riskBlockedEvents} className="text-red-400" />
            <StatusCard label="Warning 事件" value={riskWarningEvents} className="text-amber-400" />
            <StatusCard label="风控拦截" value={riskBlockedAudits} className="text-red-400" />
            <StatusCard label="通知总数" value={notifications.length} className="text-slate-100" />
            <StatusCard label="未读通知" value={unreadCount} className="text-amber-400" />
          </div>
        </div>

        {/* Section 3: Risk Event Suggestions */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-300">风险建议</h2>
          <div className="space-y-1">
            {safety.killSwitchEnabled && (
              <div className="flex items-start gap-2 rounded border border-red-700/30 bg-red-900/20 px-3 py-2 text-xs">
                <span className="mt-0.5 shrink-0 text-red-400">🔴</span>
                <div>
                  <p className="text-red-300">Kill Switch 已启用</p>
                  <p className="mt-0.5 text-slate-500">原因: {safety.reason || "未指定"}</p>
                </div>
              </div>
            )}
            {activeQueueCount > 0 && (
              <div className="flex items-start gap-2 rounded border border-amber-700/30 bg-amber-900/20 px-3 py-2 text-xs">
                <span className="mt-0.5 shrink-0 text-amber-400">🟡</span>
                <div>
                  <p className="text-amber-300">{activeQueueCount} 个待处理队列项</p>
                  <p className="mt-0.5 text-slate-500">前往执行队列查看详情</p>
                </div>
              </div>
            )}
            {riskBlockedAudits > 0 && (
              <div className="flex items-start gap-2 rounded border border-red-700/30 bg-red-900/20 px-3 py-2 text-xs">
                <span className="mt-0.5 shrink-0 text-red-400">🔴</span>
                <div>
                  <p className="text-red-300">{riskBlockedAudits} 次风控拦截记录</p>
                  <p className="mt-0.5 text-slate-500">请检查审计日志了解详情</p>
                </div>
              </div>
            )}
            {unreadCount > 0 && (
              <div className="flex items-start gap-2 rounded border border-blue-700/30 bg-blue-900/20 px-3 py-2 text-xs">
                <span className="mt-0.5 shrink-0 text-blue-400">🔵</span>
                <div>
                  <p className="text-blue-300">{unreadCount} 条未读通知</p>
                  <p className="mt-0.5 text-slate-500">前往通知中心查看</p>
                </div>
              </div>
            )}
            {!safety.killSwitchEnabled && activeQueueCount === 0 && riskBlockedAudits === 0 && unreadCount === 0 && (
              <div className="rounded border border-green-700/30 bg-green-900/20 px-3 py-2 text-xs text-green-300">
                ✅ 当前无风险建议 — 系统运行正常
              </div>
            )}
          </div>
        </div>

        {/* Section 4: Recent Risk Events */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-300">近期风险事件</h2>
          {recentRiskEvents.length === 0 ? (
            <p className="text-xs text-slate-500">暂无风险事件记录</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-500">
                    <th className="px-2 py-1">事件</th>
                    <th className="px-2 py-1">严重度</th>
                    <th className="px-2 py-1">消息</th>
                    <th className="px-2 py-1">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRiskEvents.map((e) => (
                    <tr key={e.id} className="border-b border-slate-800 hover:bg-slate-900/40">
                      <td className="px-2 py-1 text-slate-200">{e.eventType}</td>
                      <td className="px-2 py-1">
                        <span className={e.severity === "blocked" ? "text-red-400" : e.severity === "warning" ? "text-amber-400" : "text-slate-400"}>
                          {e.severity}
                        </span>
                      </td>
                      <td className="max-w-xs truncate px-2 py-1 text-slate-400" title={e.message}>
                        {e.message}
                      </td>
                      <td className="px-2 py-1 text-slate-500">{new Date(e.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
