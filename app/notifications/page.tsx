import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NotificationEvaluateButton } from "./NotificationEvaluateButton";
import { PageShell } from "@/components/PageShell";
import { queryNotificationEvents } from "@/lib/notifications/notificationStore";
import type { NotificationEvent, NotificationEventType, NotificationSeverity } from "@/lib/notifications/notificationRules";

export const metadata: Metadata = {
  title: "通知中心 — 资金费率套利看板",
  description: "只读 in-app 信号日志。V1 不接 Telegram、Email 或 Webhook。"
};

export const dynamic = "force-dynamic";

const SEVERITIES: Array<"all" | NotificationSeverity> = ["all", "info", "success", "warning"];
const EVENT_TYPES: Array<"all" | NotificationEventType> = [
  "all",
  "Alpha Signal",
  "Stable Alpha Signal",
  "Risky Alpha Warning",
  "Funding Heat Warning"
];

export default async function NotificationsPage({
  searchParams
}: {
  searchParams: Promise<{ severity?: string; eventType?: string }>;
}) {
  const params = await searchParams;
  const severity = parseSeverity(params.severity);
  const eventType = parseEventType(params.eventType);
  const events = (await queryNotificationEvents({ limit: 500 }))
    .filter((event) => severity === "all" || event.severity === severity)
    .filter((event) => eventType === "all" || event.eventType === eventType);
  const latest = events[0]?.createdAt ?? null;

  return (
    <PageShell
      actions={<NotificationEvaluateButton />}
      activeHref="/notifications"
      description="只读 in-app 信号日志，第一版不接 Telegram、Email 或 Webhook。"
      eyebrow="通知引擎"
      refreshHref="/notifications"
      title="通知中心"
      updatedAt={latest}
    >
      <section className="flex flex-col gap-3 border border-slate-800 bg-slate-950/40 p-3 lg:flex-row lg:items-center lg:justify-between">
        <form action="/notifications" className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">等级</span>
            <select className="h-9 border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400" defaultValue={severity} name="severity">
              {SEVERITIES.map((item) => (
                <option key={item} value={item}>
                  {item === "all" ? "全部" : item}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">事件类型</span>
            <select className="h-9 border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400" defaultValue={eventType} name="eventType">
              {EVENT_TYPES.map((item) => (
                <option key={item} value={item}>
                  {formatEventType(item)}
                </option>
              ))}
            </select>
          </label>
          <button className="h-9 border border-cyan-400/50 bg-cyan-400/10 px-3 text-sm text-cyan-100 hover:bg-cyan-400/20" type="submit">
            应用
          </button>
        </form>
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          <span>{events.length} 条通知</span>
          <span>Channel: in-app</span>
        </div>
      </section>

      <NotificationTable events={events} />
    </PageShell>
  );
}

function NotificationTable({ events }: { events: NotificationEvent[] }) {
  return (
    <section className="border border-slate-800 bg-panel">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-base font-semibold text-white">最近通知</h2>
        <span className="text-xs text-slate-500">本地 JSONL 存储</span>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="min-w-[1100px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400">
            <tr>
              <Header>时间</Header>
              <Header>等级</Header>
              <Header>事件类型</Header>
              <Header>标题</Header>
              <Header>消息</Header>
              <Header>币种</Header>
              <Header>来源</Header>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr className="border-b border-slate-800/70 hover:bg-slate-800/40" key={event.id}>
                <Cell>{new Date(event.createdAt).toLocaleString()}</Cell>
                <Cell>{event.severity}</Cell>
                <Cell>{formatEventType(event.eventType)}</Cell>
                <Cell>{event.title}</Cell>
                <Cell><span className="line-clamp-2 max-w-[420px]" title={event.message}>{event.message}</span></Cell>
                <Cell>{event.symbol ?? "-"}</Cell>
                <Cell>{event.source}</Cell>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={7}>暂无通知。</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Header({ children }: { children: ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2 text-left">{children}</th>;
}

function Cell({ children }: { children: ReactNode }) {
  return <td className="px-3 py-2 align-top">{children}</td>;
}

function parseSeverity(value?: string): "all" | NotificationSeverity {
  if (value === "info" || value === "success" || value === "warning") return value;
  return "all";
}

function parseEventType(value?: string): "all" | NotificationEventType {
  return EVENT_TYPES.includes(value as "all" | NotificationEventType) ? (value as "all" | NotificationEventType) : "all";
}

function formatEventType(value: "all" | NotificationEventType) {
  if (value === "all") return "全部";
  if (value === "Alpha Signal") return "Alpha 信号";
  if (value === "Stable Alpha Signal") return "稳定 Alpha 信号";
  if (value === "Risky Alpha Warning") return "高风险 Alpha 警告";
  return "Funding 热度警告";
}
