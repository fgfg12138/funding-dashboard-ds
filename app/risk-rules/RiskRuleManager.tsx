"use client";

import { Bell, Pause, Save, ShieldAlert, Square, Tag, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ExchangeName } from "@/lib/exchanges/types";
import type { RiskRule, RiskRuleAction, RiskRuleType } from "@/lib/riskRules/types";

type ApiResponse<T> = {
  status: number;
  data?: T;
  error?: string;
};

type RiskRuleFormState = {
  id?: string;
  name: string;
  ruleType: RiskRuleType;
  action: RiskRuleAction;
  enabled: boolean;
  threshold: number;
  symbol: string;
  exchange: "" | ExchangeName;
  strategyId: string;
  notes: string;
};

const EXCHANGES: Array<"" | ExchangeName> = ["", "Binance", "OKX", "Bybit"];
const RULE_TYPES: RiskRuleType[] = [
  "FundingNegative",
  "AnnualizedBelowThreshold",
  "PriceSpreadAboveThreshold",
  "AdlLevelAtThreshold",
  "VolumeBelowThreshold",
  "OpenInterestBelowThreshold"
];
const ACTIONS: Array<{ action: RiskRuleAction; label: string; icon: typeof Bell }> = [
  { action: "Alert", label: "告警", icon: Bell },
  { action: "PauseStrategy", label: "暂停", icon: Pause },
  { action: "StopStrategy", label: "停止", icon: Square },
  { action: "MarkRisk", label: "标记风险", icon: Tag }
];

const EMPTY_FORM: RiskRuleFormState = {
  name: "",
  ruleType: "FundingNegative",
  action: "Alert",
  enabled: true,
  threshold: 0,
  symbol: "",
  exchange: "",
  strategyId: "",
  notes: ""
};

export function RiskRuleManager() {
  const [rules, setRules] = useState<RiskRule[]>([]);
  const [form, setForm] = useState<RiskRuleFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const editing = Boolean(form.id);
  const sortedRules = useMemo(() => rules.slice().sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name)), [rules]);

  useEffect(() => {
    void loadRules();
  }, []);

  async function loadRules() {
    setLoading(true);
    const response = await fetch("/api/risk-rules").then((res) => res.json() as Promise<ApiResponse<RiskRule[]>>);
    setRules(response.data ?? []);
    setError(response.error ?? null);
    setLoading(false);
  }

  async function saveRule() {
    setError(null);
    const response = await fetch(form.id ? `/api/risk-rules/${encodeURIComponent(form.id)}` : "/api/risk-rules", {
      body: JSON.stringify(buildPayload(form)),
      headers: { "Content-Type": "application/json" },
      method: form.id ? "PATCH" : "POST"
    }).then((res) => res.json() as Promise<ApiResponse<RiskRule>>);

    if (response.error) {
      setError(response.error);
      return;
    }

    setForm(EMPTY_FORM);
    await loadRules();
  }

  async function patchRule(rule: RiskRule, body: Partial<RiskRule>) {
    await fetch(`/api/risk-rules/${encodeURIComponent(rule.id)}`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    });
    await loadRules();
  }

  async function deleteRule(rule: RiskRule) {
    await fetch(`/api/risk-rules/${encodeURIComponent(rule.id)}`, { method: "DELETE" });
    if (form.id === rule.id) {
      setForm(EMPTY_FORM);
    }
    await loadRules();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="rounded border border-slate-800 bg-panel">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-base font-semibold text-white">{editing ? "编辑风险规则" : "创建风险规则"}</h2>
          {editing && (
            <button className="text-xs text-cyan-300 hover:text-cyan-100" onClick={() => setForm(EMPTY_FORM)} type="button">
              新建
            </button>
          )}
        </div>
        <div className="space-y-3 p-4">
          {error && <div className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
          <TextInput label="规则名称" onChange={(name) => setForm((prev) => ({ ...prev, name }))} value={form.name} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectInput label="规则类型" onChange={(ruleType) => setForm((prev) => ({ ...prev, ruleType: ruleType as RiskRuleType }))} options={RULE_TYPES} value={form.ruleType} />
            <SelectInput label="动作" onChange={(action) => setForm((prev) => ({ ...prev, action: action as RiskRuleAction }))} options={ACTIONS.map((item) => item.action)} value={form.action} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberInput label="阈值" onChange={(threshold) => setForm((prev) => ({ ...prev, threshold }))} step="0.0001" value={form.threshold} />
            <TextInput label="币种" onChange={(symbol) => setForm((prev) => ({ ...prev, symbol }))} value={form.symbol} />
            <SelectInput label="交易所" onChange={(exchange) => setForm((prev) => ({ ...prev, exchange: exchange as "" | ExchangeName }))} options={EXCHANGES} value={form.exchange} />
          </div>
          <TextInput label="策略 ID" onChange={(strategyId) => setForm((prev) => ({ ...prev, strategyId }))} value={form.strategyId} />
          <label className="flex items-center gap-2 rounded border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200">
            <input
              checked={form.enabled}
              onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))}
              type="checkbox"
            />
            启用
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">备注</span>
            <textarea
              className="min-h-24 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              value={form.notes}
            />
          </label>
          <button
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded border border-cyan-400/50 bg-cyan-400/10 px-3 text-sm text-cyan-100 hover:bg-cyan-400/20"
            onClick={() => void saveRule()}
            type="button"
          >
            <Save className="h-4 w-4" />
            {editing ? "保存修改" : "创建规则"}
          </button>
        </div>
      </section>

      <section className="rounded border border-slate-800 bg-panel">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-base font-semibold text-white">风险规则列表</h2>
          <span className="text-xs text-slate-500">{loading ? "加载中" : `${rules.length} 条规则`}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <Header>名称</Header>
                <Header>类型</Header>
                <Header>动作</Header>
                <Header>阈值</Header>
                <Header>币种</Header>
                <Header>交易所</Header>
                <Header>启用</Header>
                <Header>创建时间</Header>
                <Header>更新时间</Header>
                <Header>操作</Header>
              </tr>
            </thead>
            <tbody>
              {sortedRules.map((rule) => (
                <tr className="border-b border-slate-800/70 hover:bg-slate-800/40" key={rule.id}>
                  <Cell strong>
                    <button className="text-left text-cyan-300 hover:text-cyan-100" onClick={() => setForm(toForm(rule))} type="button">
                      {rule.name}
                    </button>
                  </Cell>
                  <Cell>{rule.ruleType}</Cell>
                  <Cell>{rule.action}</Cell>
                  <Cell>{formatThreshold(rule)}</Cell>
                  <Cell>{rule.symbol ?? "-"}</Cell>
                  <Cell>{rule.exchange ?? "-"}</Cell>
                  <Cell className={rule.enabled ? "text-emerald-300" : "text-slate-500"}>{rule.enabled ? "启用" : "禁用"}</Cell>
                  <Cell>{new Date(rule.createdAt).toLocaleString()}</Cell>
                  <Cell>{new Date(rule.updatedAt).toLocaleString()}</Cell>
                  <Cell>
                    <div className="flex items-center gap-1">
                      <button
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-700 text-slate-300 hover:border-cyan-400 hover:text-cyan-100"
                        onClick={() => void patchRule(rule, { enabled: !rule.enabled })}
                        title={rule.enabled ? "禁用" : "启用"}
                        type="button"
                      >
                        {rule.enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                      </button>
                      {ACTIONS.map((action) => {
                        const Icon = action.icon;
                        return (
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-700 text-slate-300 hover:border-cyan-400 hover:text-cyan-100"
                            key={action.action}
                            onClick={() => void patchRule(rule, { action: action.action })}
                            title={action.label}
                            type="button"
                          >
                            <Icon className="h-4 w-4" />
                          </button>
                        );
                      })}
                      <button
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                        onClick={() => void deleteRule(rule)}
                        title="Delete"
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </Cell>
                </tr>
              ))}
              {sortedRules.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-slate-500" colSpan={10}>
                    No risk rules yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function buildPayload(form: RiskRuleFormState) {
  return {
    name: form.name,
    ruleType: form.ruleType,
    action: form.action,
    enabled: form.enabled,
    threshold: form.threshold,
    symbol: form.symbol || undefined,
    exchange: form.exchange || undefined,
    strategyId: form.strategyId || undefined,
    notes: form.notes || undefined
  };
}

function toForm(rule: RiskRule): RiskRuleFormState {
  return {
    id: rule.id,
    name: rule.name,
    ruleType: rule.ruleType,
    action: rule.action,
    enabled: rule.enabled,
    threshold: rule.threshold,
    symbol: rule.symbol ?? "",
    exchange: rule.exchange ?? "",
    strategyId: rule.strategyId ?? "",
    notes: rule.notes ?? ""
  };
}

function TextInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <input
        className="h-10 w-full rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function NumberInput({ label, onChange, step, value }: { label: string; onChange: (value: number) => void; step: string; value: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <input
        className="h-10 w-full rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="number"
        value={value}
      />
    </label>
  );
}

function SelectInput({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: string[]; value: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <select
        className="h-10 w-full rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option || "全部"}
          </option>
        ))}
      </select>
    </label>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap border-b border-slate-800 px-3 py-2 font-medium">{children}</th>;
}

function Cell({ children, className = "", strong = false }: { children: React.ReactNode; className?: string; strong?: boolean }) {
  return <td className={`whitespace-nowrap px-3 py-2 ${strong ? "font-medium text-white" : "text-slate-200"} ${className}`}>{children}</td>;
}

function formatThreshold(rule: RiskRule): string {
  if (rule.ruleType === "FundingNegative") return "Funding < 0";
  if (rule.ruleType === "AdlLevelAtThreshold") return `ADL >= ${rule.threshold}`;
  if (rule.ruleType === "VolumeBelowThreshold" || rule.ruleType === "OpenInterestBelowThreshold") {
    return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(rule.threshold)}`;
  }
  return `${rule.threshold}%`;
}
