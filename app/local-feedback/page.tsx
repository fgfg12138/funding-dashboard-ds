"use client";

import { useCallback, useState } from "react";
import { PageShell } from "@/components/PageShell";
import type { TesterFeedback, TesterFeedbackIssueType, TesterFeedbackSeverity } from "@/lib/localTesting/testerFeedbackTypes";

const ISSUE_TYPES: TesterFeedbackIssueType[] = [
  "UI看不懂", "数据不刷新", "页面报错", "数字异常", "安全状态不清楚", "导航找不到", "其他",
];
const SEVERITIES: TesterFeedbackSeverity[] = ["低", "中", "高", "严重"];
const PAGES = ["/opportunities", "/dashboard", "/production-console", "/local-test-guide", "/spread-opportunities", "/spread-opportunities", "/safety", "/audit", "其他"];

const EMPTY_FORM = {
  page: "",
  issueType: "UI看不懂" as TesterFeedbackIssueType,
  severity: "低" as TesterFeedbackSeverity,
  description: "",
  stepsToReproduce: "",
  expectedResult: "",
  actualResult: "",
  screenshotSuggested: false,
  browser: "",
};

export default function LocalFeedbackPage() {
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });

  const update = useCallback(<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const feedback: TesterFeedback = {
    ...form,
    createdAt: Date.now(),
  };

  const json = JSON.stringify(feedback, null, 2);

  return (
    <PageShell
      activeHref="/local-feedback"
      title="本地反馈"
      description="填写反馈模板后复制 JSON 发送给开发者 — 不上传，不联网"
      showRefresh={false}
    >
      {/* ── Safety Notice ── */}
      <section className="border border-cyan-800/40 bg-cyan-950/20">
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs">
          <span className="font-semibold text-cyan-200">本地测试</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">不会自动交易</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">不会发送真实订单</span>
          <span className="text-slate-500">|</span>
          <span className="text-emerald-300">不会上传 API Key</span>
        </div>
      </section>

      {/* ── Quick Issue Buttons ── */}
      <section className="border border-slate-800 bg-slate-950/60">
        <div className="border-b border-slate-800 px-4 py-2">
          <h2 className="text-sm font-semibold text-white">快速反馈分类</h2>
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          {ISSUE_TYPES.map((type) => (
            <button
              key={type}
              className={`border px-3 py-1.5 text-xs ${
                form.issueType === type
                  ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                  : "border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600"
              }`}
              onClick={() => update("issueType", type)}
              type="button"
            >
              {type}
            </button>
          ))}
        </div>
      </section>

      {/* ── Form ── */}
      <section className="border border-slate-800 bg-slate-950/60">
        <div className="border-b border-slate-800 px-4 py-2">
          <h2 className="text-sm font-semibold text-white">反馈表单</h2>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-xs text-slate-400">页面</span>
            <select
              className="w-full border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={form.page}
              onChange={(e) => update("page", e.target.value)}
            >
              <option value="">选择页面</option>
              {PAGES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs text-slate-400">严重程度</span>
            <select
              className="w-full border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              value={form.severity}
              onChange={(e) => update("severity", e.target.value as TesterFeedbackSeverity)}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="text-xs text-slate-400">问题描述</span>
            <textarea
              className="w-full border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
              rows={2}
              placeholder="请描述你遇到的问题..."
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="text-xs text-slate-400">复现步骤</span>
            <textarea
              className="w-full border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
              rows={2}
              placeholder="1. 打开页面... 2. 点击... 3. 看到..."
              value={form.stepsToReproduce}
              onChange={(e) => update("stepsToReproduce", e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs text-slate-400">期望结果</span>
            <input
              className="w-full border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
              placeholder="你希望看到什么？"
              value={form.expectedResult}
              onChange={(e) => update("expectedResult", e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs text-slate-400">实际结果</span>
            <input
              className="w-full border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
              placeholder="实际看到了什么？"
              value={form.actualResult}
              onChange={(e) => update("actualResult", e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs text-slate-400">浏览器 / 设备</span>
            <input
              className="w-full border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
              placeholder="Chrome / Edge / Safari"
              value={form.browser}
              onChange={(e) => update("browser", e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input
              checked={form.screenshotSuggested}
              className="h-4 w-4 accent-cyan-400"
              type="checkbox"
              onChange={(e) => update("screenshotSuggested", e.target.checked)}
            />
            <span className="text-slate-300">建议截图</span>
          </label>
        </div>
      </section>

      {/* ── JSON Preview ── */}
      <section className="border border-slate-800 bg-slate-950/60">
        <div className="border-b border-slate-800 px-4 py-2">
          <h2 className="text-sm font-semibold text-white">JSON 预览 — 复制后发送给开发者</h2>
        </div>
        <div className="p-4">
          <pre className="overflow-x-auto border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-cyan-300">{json}</pre>
          <p className="mt-2 text-xs text-slate-500">此数据不会上传至任何服务器。仅用于复制发送。</p>
        </div>
      </section>
    </PageShell>
  );
}
