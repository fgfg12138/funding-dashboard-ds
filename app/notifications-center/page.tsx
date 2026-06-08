"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { StatCard } from "@/components/ui/dashboard";
import { listLocalNotifications, markLocalNotificationRead, markAllLocalNotificationsRead, clearLocalNotifications, unreadLocalNotificationCount } from "@/lib/notifications/localNotificationStore";
import type { LocalNotification } from "@/lib/notifications/localNotificationTypes";

const TYPE_LABELS: Record<string, string> = { risk: "风控", confirmation: "确认", queue: "队列", safety: "安全", system: "系统" };
const SEV_LABELS: Record<string, string> = { info: "信息", warning: "警告", blocked: "拦截", error: "错误" };
const SEV_COLORS: Record<string, string> = { info: "text-slate-300", warning: "text-yellow-200", blocked: "text-rose-300", error: "text-red-300" };

export default function NotificationsCenterPage() {
  const [notifs, setNotifs] = useState<LocalNotification[]>([]);
  const [filterType, setFilterType] = useState("all");

  const load = useCallback(() => {
    let all = listLocalNotifications();
    if (filterType !== "all") all = all.filter((n) => n.type === filterType);
    setNotifs(all);
  }, [filterType]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const all = listLocalNotifications();
    return { total: all.length, unread: all.filter((n) => n.readAt === null).length, blocked: all.filter((n) => n.severity === "blocked").length, error: all.filter((n) => n.severity === "error").length };
  }, [notifs]);

  const handleMarkRead = useCallback((id: string) => { markLocalNotificationRead(id); load(); }, [load]);

  return (
    <PageShell
      activeHref="/notifications-center"
      description="本地通知中心 — 展示关键事件提醒。当前只支持本地站内通知，不发送 Telegram / Email / Webhook。"
      eyebrow="Local Notifications — In-App Only"
      onRefresh={load}
      title="通知中心"
      updatedAt={null}
    >
      <section className="border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-xs text-yellow-200">
        <p>⚠ 当前只支持本地站内通知，不发送 Telegram / Email / Webhook，不连接外部服务。</p>
      </section>

      <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="未读" value={stats.unread.toLocaleString()} tone="cyan" />
        <StatCard label="总通知" value={stats.total.toLocaleString()} tone="slate" />
        <StatCard label="拦截" value={stats.blocked.toLocaleString()} tone="red" />
        <StatCard label="错误" value={stats.error.toLocaleString()} tone="orange" />
      </section>

      <section className="flex flex-wrap items-center gap-3 border border-slate-800 bg-slate-950/40 px-4 py-3">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <span>类型</span>
          <select className="h-8 border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">全部</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <button className="h-8 border border-slate-700 px-3 text-xs text-slate-400 hover:text-cyan-100" onClick={() => { markAllLocalNotificationsRead(); load(); }} type="button">全部标记已读</button>
        <button className="h-8 border border-slate-700 px-3 text-xs text-slate-400 hover:text-rose-300" onClick={() => { clearLocalNotifications(); load(); }} type="button">清空通知</button>
      </section>

      <section className="border border-slate-800 bg-slate-950/40">
        <div className="max-h-[600px] overflow-auto">
          <table className="min-w-[1100px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400"><tr>
              <Th>时间</Th><Th>类型</Th><Th>等级</Th><Th>币种</Th><Th>标题</Th><Th>消息</Th><Th>状态</Th><Th align="right">操作</Th>
            </tr></thead>
            <tbody className="divide-y divide-slate-800">
              {notifs.map((n) => (
                <tr className={`hover:bg-slate-900/70 ${n.readAt === null ? "bg-cyan-950/20" : ""}`} key={n.id}>
                  <Td>{new Date(n.createdAt).toLocaleString()}</Td>
                  <Td><span className="text-slate-300">{TYPE_LABELS[n.type]}</span></Td>
                  <Td><span className={SEV_COLORS[n.severity]}>{SEV_LABELS[n.severity]}</span></Td>
                  <Td><span className="font-semibold text-slate-100">{n.symbol ?? "-"}</span></Td>
                  <Td><span className="text-slate-200">{n.title}</span></Td>
                  <Td><span className="max-w-[300px] truncate text-slate-400">{n.message}</span></Td>
                  <Td><span className={n.readAt ? "text-slate-500" : "text-cyan-300"}>{(n.readAt ? "已读" : "未读")}</span></Td>
                  <Td align="right">{n.readAt === null ? <button className="h-7 border border-slate-700 px-2 text-xs text-slate-400 hover:text-cyan-100" onClick={() => handleMarkRead(n.id)} type="button">标为已读</button> : <span className="text-slate-600">-</span>}</Td>
                </tr>
              ))}
              {notifs.length === 0 && <tr><td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={8}>暂无通知。</td></tr>}
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
