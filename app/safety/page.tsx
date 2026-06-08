"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { StatCard } from "@/components/ui/dashboard";
import { getSafetyState, enableKillSwitch, disableKillSwitch, isKillSwitchEnabled } from "@/lib/safety/safetyStore";
import type { SafetyState } from "@/lib/safety/safetyTypes";
import { createAuditEvent } from "@/lib/audit/auditStore";
import { createLocalNotification } from "@/lib/notifications/localNotificationStore";
import { AlertTriangle, ShieldOff, ShieldCheck } from "lucide-react";

export default function SafetyPage() {
  const [safety, setSafety] = useState<SafetyState>(getSafetyState());
  const [reason, setReason] = useState("");

  const refresh = useCallback(() => {
    setSafety(getSafetyState());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleEnable = useCallback(() => {
    const r = reason.trim() || "用户手动开启";
    enableKillSwitch(r);
    createAuditEvent({
      eventType: "kill_switch_enabled",
      entityType: "safety",
      entityId: "kill-switch",
      severity: "warning",
      message: `Kill Switch 已开启: ${r}`,
      metadata: { reason: r },
    });
    createLocalNotification({
      type: "safety",
      severity: "warning",
      title: "Kill Switch 已启用",
      message: r,
      entityType: "safety",
      entityId: "kill-switch",
    });
    setReason("");
    refresh();
  }, [reason, refresh]);

  const handleDisable = useCallback(() => {
    disableKillSwitch();
    createAuditEvent({
      eventType: "kill_switch_disabled",
      entityType: "safety",
      entityId: "kill-switch",
      severity: "info",
      message: "Kill Switch 已关闭",
    });
    createLocalNotification({
      type: "safety",
      severity: "info",
      title: "Kill Switch 已关闭",
      message: "安全控制已恢复正常",
      entityType: "safety",
      entityId: "kill-switch",
    });
    refresh();
  }, [refresh]);

  return (
    <PageShell
      activeHref="/safety"
      description="全局安全控制中心 — Kill Switch 开启后，停止所有预览、确认和队列操作。"
      eyebrow="Safety Controls — Phase 4.5"
      title="安全控制"
      updatedAt={safety.updatedAt > 0 ? safety.updatedAt : null}
    >
      {/* Status banner */}
      {safety.killSwitchEnabled ? (
        <section className="border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-xs text-rose-200">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" /> Kill Switch 已启用
          </p>
          <p className="mt-1">原因：{safety.reason}</p>
          <p className="mt-0.5">
            新预览、确认和队列操作已被禁用。现有数据不受影响。
            {safety.enabledAt ? ` 开启时间: ${new Date(safety.enabledAt).toLocaleString()}` : ""}
          </p>
        </section>
      ) : (
        <section className="border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-200">
          <p className="flex items-center gap-2 font-medium">
            <ShieldCheck className="h-4 w-4" /> Kill Switch 已关闭 — 系统正常运行
          </p>
        </section>
      )}

      {/* Stat cards */}
      <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Kill Switch"
          value={safety.killSwitchEnabled ? "已启用" : "已关闭"}
          tone={safety.killSwitchEnabled ? "red" : "green"}
        />
        <StatCard label="开启原因" value={safety.reason ?? "-"} tone="slate" />
        <StatCard label="数据来源" value={safety.source} tone="slate" />
        <StatCard label="当前模式" value="本地开关" tone="slate" />
      </section>

      {/* Controls */}
      <section className="border border-slate-800 bg-slate-950/40 p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">安全控制</h2>
        <p className="mb-3 text-xs text-slate-400">
          Kill Switch 开启后，将阻止新建 Order Preview、确认预览和加入执行队列。
          现有数据不受影响，审计日志继续记录。
          此开关仅影响本地操作，<strong className="text-amber-300">不涉及真实交易所</strong>。
        </p>

        {!safety.killSwitchEnabled ? (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">开启原因（可选）</span>
              <input
                className="h-10 w-full max-w-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-rose-400"
                placeholder="例如：市场波动大、策略异常、临时暂停..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              className="inline-flex h-10 items-center gap-2 border border-rose-400/50 bg-rose-400/10 px-4 text-sm font-medium text-rose-200 hover:bg-rose-400/20"
              onClick={handleEnable}
              type="button"
            >
              <ShieldOff className="h-4 w-4" /> 启用 Kill Switch
            </button>
          </div>
        ) : (
          <button
            className="inline-flex h-10 items-center gap-2 border border-emerald-400/50 bg-emerald-400/10 px-4 text-sm font-medium text-emerald-200 hover:bg-emerald-400/20"
            onClick={handleDisable}
            type="button"
          >
            <ShieldCheck className="h-4 w-4" /> 关闭 Kill Switch
          </button>
        )}
      </section>
    </PageShell>
  );
}
