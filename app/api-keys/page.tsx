"use client";

import { AlertTriangle, Key, Lock, Server, ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { verifyApiKeyPermissions, getPermissionWarnings } from "@/lib/apiKeys/permissionVerifier";
import type { PermissionVerificationResult } from "@/lib/apiKeys/types";

const EXCHANGES = ["Binance", "OKX", "Bybit"] as const;

const SAFETY_NOTES = [
  "禁止开启提币权限 — 如果 Key 有提币权限，系统将拒绝连接",
  "不要使用主账户 API Key — 建议使用子账户并设置独立权限",
  "IP 白名单 — 强烈建议为 API Key 设置 IP 白名单",
  "当前版本不会保存 Secret — 本页面为 UI 占位，不存储任何密钥",
  "当前版本不会发起任何私有 API 请求 — 不连接交易所私有接口",
  "下一阶段才会实现加密存储设计 — 当前不处理任何敏感信息",
];

export default function ApiKeysPage() {
  return (
    <PageShell
      activeHref="/api-keys"
      description="API Key 管理占位页面 — 展示未来交易所连接入口、安全边界和权限要求。当前不保存任何 API Key。"
      eyebrow="Phase 3.1 — API Key UI Placeholder"
      title="API管理"
      updatedAt={null}
    >
      {/* Mode status */}
      <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          icon={<Lock className="h-5 w-5" />}
          label="当前模式"
          value="Phase 3.1 UI 占位"
          tone="slate"
        />
        <StatusCard
          icon={<ShieldOff className="h-5 w-5" />}
          label="API Key 保存"
          value="未保存"
          tone="slate"
        />
        <StatusCard
          icon={<Server className="h-5 w-5" />}
          label="私有接口连接"
          value="未连接"
          tone="slate"
        />
        <StatusCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="实盘下单"
          value="禁止"
          tone="slate"
        />
      </section>

      {/* Clear warning */}
      <section className="border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-xs text-yellow-200">
        <p className="font-medium">⚠ 占位页面 — 不可用</p>
        <p className="mt-1">
          这是一个 API Key 管理 UI 占位页面。当前不能输入真实 API Key，不能连接交易所私有接口，不能进行任何交易操作。
          本页面仅用于展示未来 Phase 3 的功能设计和安全边界要求。
        </p>
      </section>

      {/* Exchange cards */}
      <section className="grid gap-3 xl:grid-cols-3">
        {EXCHANGES.map((exchange) => (
          <section className="border border-slate-800 bg-slate-950/40" key={exchange}>
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h2 className="text-base font-semibold text-white">{exchange}</h2>
              <span className="border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-400">
                未连接
              </span>
            </div>
            <div className="space-y-3 p-4">
              {/* Status rows */}
              <StatusRow label="API Key" value="未配置" />
              <StatusRow label="Secret Key" value="未配置" />
              <StatusRow label="权限状态" value="未检测" />

              {/* Permission badges */}
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500">权限要求</p>
                <div className="flex flex-wrap gap-2">
                  <Badge label="提币权限" required={false} />
                  <Badge label="交易权限" required={false} />
                  <Badge label="只读权限" required={true} />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-1">
                <DisabledButton label="配置 API Key" />
                <DisabledButton label="权限检测" />
                <DisabledButton label="删除连接" tone="rose" />
              </div>
            </div>
          </section>
        ))}
      </section>

      {/* Mock permission verifier status */}
      <section className="border border-slate-800 bg-slate-950/40 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Mock 权限检测器</h2>
          <span className="border border-yellow-400/30 bg-yellow-400/10 px-2 py-0.5 text-xs text-yellow-200">
            离线 Mock
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Phase 3.3 Mock 验证器已就绪 — <code className="text-cyan-300">lib/apiKeys/permissionVerifier.ts</code>。
          可模拟检测 read / trade / withdraw 权限组合，但<strong className="text-amber-300">不连接交易所</strong>。
          所有检测结果带有 <code className="text-slate-300">mock-verification-only</code> 标记，
          不可作为真实交易安全依据。
        </p>
        <div className="mt-2 grid gap-1.5 text-xs text-slate-500">
          <MockExample label="只读 Key（正确配置）" permissions={["read"]} hasIpWhitelist={true} />
          <MockExample label="启用交易权限" permissions={["read", "trade"]} hasIpWhitelist={true} />
          <MockExample label="启用提币权限" permissions={["read", "withdraw"]} hasIpWhitelist={true} />
        </div>
      </section>

      {/* Safety notes */}
      <section className="border border-amber-400/30 bg-amber-400/10 px-4 py-4 text-xs text-amber-200">
        <p className="mb-2 font-medium text-amber-100">🔒 安全要求（未来连接时需遵守）</p>
        <ul className="space-y-2">
          {SAFETY_NOTES.map((note, i) => (
            <li className="flex items-start gap-2" key={i}>
              <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/60" />
              {note}
            </li>
          ))}
        </ul>
      </section>

      {/* Phase 3.2/3.3/3.4 status */}
      <section className="border border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-400">
        <p>
          Phase 3.2 加密存储 + Phase 3.3 Mock 权限检测 + Phase 3.4 Mock 账户适配器 + Phase 3.5 账户同步页面 + Phase 3.6 账户风控接入 — <span className="text-emerald-300">Phase 3 已完成</span>。
          UI 仍未开放输入，按钮保持 disabled — 下一阶段 Phase 4 半自动交易设计。当前仍不开放 API Key 输入。
        </p>
      </section>

      {/* Phase 3 architecture reference */}
      <section className="border border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-500">
        <p>
          详细架构设计请参考{' '}
          <a
            className="text-cyan-300 hover:text-cyan-100"
            href="/docs/LIVE_TRADING_ARCHITECTURE.md"
            target="_blank"
          >
            LIVE_TRADING_ARCHITECTURE.md
          </a>
        </p>
      </section>
    </PageShell>
  );
}

/* ── Components ───────────────────────────────────────── */

function StatusCard({
  icon,
  label,
  value,
  tone = "slate",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "slate" | "cyan" | "green" | "yellow" | "orange" | "red";
}) {
  const toneClass = {
    slate: "text-slate-100",
    cyan: "text-cyan-300",
    green: "text-emerald-300",
    yellow: "text-yellow-200",
    orange: "text-orange-300",
    red: "text-red-300",
  }[tone];

  return (
    <div className="border border-slate-800 bg-slate-950/60 px-4 py-3">
      <div className="mb-2 text-slate-500">{icon}</div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-300">{value}</span>
    </div>
  );
}

function Badge({ label, required }: { label: string; required: boolean }) {
  return (
    <span
      className={`border px-2 py-0.5 text-xs ${
        required
          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
          : "border-slate-700 bg-slate-900 text-slate-400"
      }`}
    >
      {required ? "✅ " : "✗ "}
      {label}
    </span>
  );
}

function DisabledButton({ label, tone = "slate" }: { label: string; tone?: "slate" | "rose" }) {
  const colorClass =
    tone === "rose"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
      : "border-slate-700 bg-slate-900 text-slate-400";

  return (
    <button
      className={`inline-flex h-7 items-center gap-1 border px-2 text-xs ${colorClass} cursor-not-allowed opacity-60`}
      disabled
      title="当前版本不可用 — 占位 UI"
      type="button"
    >
      {label}
    </button>
  );
}

function MockExample({
  label,
  permissions,
  hasIpWhitelist,
}: {
  label: string;
  permissions: string[];
  hasIpWhitelist: boolean;
}) {
  const result = verifyApiKeyPermissions({ permissions: permissions as any, hasIpWhitelist });

  const statusColors: Record<string, string> = {
    passed: "text-emerald-300",
    warning: "text-yellow-200",
    rejected: "text-rose-300",
  };

  return (
    <div className="flex items-center justify-between border-t border-slate-800 pt-1.5 first:border-t-0">
      <span className="text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium ${statusColors[result.status] ?? "text-slate-400"}`}>
          {result.status === "passed" ? "✅ 通过" : result.status === "warning" ? "⚠ 警告" : "✗ 拒绝"}
        </span>
        <span className="text-[11px] text-slate-600">(Mock)</span>
      </div>
    </div>
  );
}
