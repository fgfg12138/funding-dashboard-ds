"use client";

/**
 * Testnet Readiness Dashboard — Phase 5.26
 *
 * Read-only dashboard showing the testnet readiness checklist state.
 * Does NOT enable testnet, does NOT retrieve secrets, does NOT place orders.
 */

import { useMemo } from "react";
import { PageShell } from "@/components/PageShell";
import { buildReadinessSummary, getRequiredBlockers } from "@/lib/liveAdapters/testnetReadinessSummary";
import { buildTestnetReadinessChecklist } from "@/lib/liveAdapters/testnetReadinessChecklist";
import type { TestnetReadinessCategory } from "@/lib/liveAdapters/testnetReadinessTypes";

const CATEGORY_LABELS: Record<string, string> = {
  env: "环境配置",
  middleware: "中间件",
  secret: "Secret 安全",
  permission: "权限检查",
  signing: "签名",
  adapter: "适配器",
  risk: "风控",
  audit: "审计",
  rollback: "回滚",
  ops: "运维",
};

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  pass: { label: "✅ Pass", cls: "text-green-400" },
  blocked: { label: "🔴 Blocked", cls: "text-red-400" },
  "not-started": { label: "⚪ Not Started", cls: "text-slate-400" },
  fail: { label: "❌ Fail", cls: "text-red-500" },
};

export default function TestnetReadinessPage() {
  const summary = useMemo(() => buildReadinessSummary(), []);
  const blockers = useMemo(() => getRequiredBlockers(), []);
  const allItems = useMemo(() => buildTestnetReadinessChecklist().items, []);

  const STATS = [
    { label: "总项数", value: summary.total, cls: "text-slate-100" },
    { label: "✅ Pass", value: summary.pass, cls: "text-green-400" },
    { label: "🔴 Blocked", value: summary.blocked, cls: "text-red-400" },
    { label: "⚪ Not Started", value: summary.notStarted, cls: "text-slate-400" },
    { label: "⚠ Required Blocked", value: summary.requiredBlocked, cls: "text-amber-400" },
  ];

  return (
    <PageShell activeHref="/testnet-readiness" title="Testnet Readiness" description="Testnet readiness assessment dashboard — read-only, does not enable testnet">
      <div className="space-y-6 p-4">
        {/* Warning Banner */}
        <div className="border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <p className="font-semibold">⚠ Readiness Dashboard Only</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-200/80">
            <li>Does NOT enable Testnet</li>
            <li>Does NOT retrieve Secrets</li>
            <li>Does NOT place orders</li>
          </ul>
        </div>

        {/* Readiness Status */}
        <div className={`rounded border px-4 py-3 ${summary.ready ? "border-green-500/30 bg-green-500/10" : "border-red-500/30 bg-red-500/10"}`}>
          <p className="text-lg font-bold">
            Testnet Readiness:{" "}
            <span className={summary.ready ? "text-green-400" : "text-red-400"}>
              {summary.ready ? "✅ READY" : "❌ NOT READY"}
            </span>
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {summary.requiredBlocked} required item{summary.requiredBlocked !== 1 ? "s" : ""} not yet pass
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-5 gap-3">
          {STATS.map((s) => (
            <div key={s.label} className="rounded border border-slate-700 bg-slate-900/50 px-3 py-2 text-center">
              <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
              <p className="mt-0.5 text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Category Breakdown */}
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-300">Category Breakdown</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {Object.entries(summary.byCategory).map(([cat, data]) => (
              <div key={cat} className="rounded border border-slate-700 bg-slate-900/30 px-3 py-2 text-xs">
                <p className="font-medium text-slate-300">{CATEGORY_LABELS[cat] || cat}</p>
                <p className="mt-1 text-green-400">{data.pass}/{data.total} pass</p>
                {data.blocked > 0 && <p className="text-red-400">{data.blocked} blocked</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Required Blockers */}
        <div>
          <h2 className="mb-2 text-sm font-semibold text-red-400">Required Blockers</h2>
          <div className="space-y-1">
            {blockers.map((b) => (
              <div key={b.id} className="flex items-start gap-2 rounded border border-slate-700 bg-slate-900/30 px-3 py-2 text-xs">
                <span className={STATUS_STYLES[b.status]?.cls}>{STATUS_STYLES[b.status]?.label || b.status}</span>
                <div className="flex-1">
                  <p className="text-slate-200">{b.label}</p>
                  {b.blockingReason && <p className="mt-0.5 text-slate-500">{b.blockingReason}</p>}
                </div>
                <span className="shrink-0 text-slate-600">{CATEGORY_LABELS[b.category] || b.category}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Full Checklist Table */}
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-300">All Checklist Items</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-500">
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">Category</th>
                  <th className="px-2 py-1">Item</th>
                  <th className="px-2 py-1">Required</th>
                  <th className="px-2 py-1">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {allItems.map((item) => {
                  const st = STATUS_STYLES[item.status] || { label: item.status, cls: "text-slate-400" };
                  return (
                    <tr key={item.id} className="border-b border-slate-800 hover:bg-slate-900/40">
                      <td className={`px-2 py-1 ${st.cls}`}>{st.label}</td>
                      <td className="px-2 py-1 text-slate-400">{CATEGORY_LABELS[item.category] || item.category}</td>
                      <td className="px-2 py-1 text-slate-200">{item.label}</td>
                      <td className="px-2 py-1 text-slate-500">{item.required ? "Yes" : "No"}</td>
                      <td className="max-w-xs truncate px-2 py-1 text-slate-500" title={item.evidence}>{item.evidence}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
