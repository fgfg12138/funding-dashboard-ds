"use client";

import { Pause, Play, Save, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExchangeName } from "@/lib/exchanges/types";
import type { Strategy, StrategyStatus, StrategyType } from "@/lib/strategies/types";
import type { PaperStrategyTemplate } from "@/lib/execution/paperStrategyTypes";
import {
  activatePaperStrategyTemplate,
  deactivatePaperStrategyTemplate,
  listPaperStrategyTemplates,
} from "@/lib/execution/paperStrategyStore";

type ApiResponse<T> = {
  status: number;
  data?: T;
  error?: string;
};

type StrategyFormState = {
  id?: string;
  name: string;
  strategyType: StrategyType;
  symbol: string;
  spotExchange: ExchangeName;
  perpExchange: ExchangeName;
  minFundingRate: number;
  minAnnualized: number;
  maxLeverage: number;
  longExchange: ExchangeName;
  shortExchange: ExchangeName;
  minFundingSpread: number;
  minAnnualizedSpread: number;
  status: StrategyStatus;
  notes: string;
};

const EXCHANGES: ExchangeName[] = ["Binance", "OKX", "Bybit"];
const STATUS_ACTIONS: Array<{ label: string; status: StrategyStatus; icon: typeof Play }> = [
  { label: "启动", status: "running", icon: Play },
  { label: "暂停", status: "paused", icon: Pause },
  { label: "停止", status: "stopped", icon: Square }
];

const EMPTY_FORM: StrategyFormState = {
  name: "",
  strategyType: "SpotPerp",
  symbol: "BTC/USDT",
  spotExchange: "Binance",
  perpExchange: "Bybit",
  minFundingRate: 0.0001,
  minAnnualized: 30,
  maxLeverage: 2,
  longExchange: "Binance",
  shortExchange: "Bybit",
  minFundingSpread: 0.0002,
  minAnnualizedSpread: 25,
  status: "draft",
  notes: ""
};

export function StrategyManager() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [paperTemplates, setPaperTemplates] = useState<PaperStrategyTemplate[]>([]);
  const [form, setForm] = useState<StrategyFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const editing = Boolean(form.id);
  const sortedStrategies = useMemo(
    () => strategies.slice().sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name)),
    [strategies]
  );

  useEffect(() => {
    void loadStrategies();
    loadPaperTemplates();
  }, []);

  async function loadStrategies() {
    setLoading(true);
    const response = await fetch("/api/strategies").then((res) => res.json() as Promise<ApiResponse<Strategy[]>>);
    setStrategies(response.data ?? []);
    setError(response.error ?? null);
    setLoading(false);
  }

  function loadPaperTemplates() {
    setPaperTemplates(listPaperStrategyTemplates());
  }

  async function saveStrategy() {
    setError(null);
    const payload = buildPayload(form);
    const response = await fetch(form.id ? `/api/strategies/${encodeURIComponent(form.id)}` : "/api/strategies", {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: form.id ? "PATCH" : "POST"
    }).then((res) => res.json() as Promise<ApiResponse<Strategy>>);

    if (response.error) {
      setError(response.error);
      return;
    }

    setForm(EMPTY_FORM);
    await loadStrategies();
  }

  async function patchStatus(strategy: Strategy, status: StrategyStatus) {
    await fetch(`/api/strategies/${encodeURIComponent(strategy.id)}`, {
      body: JSON.stringify({ status }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    });
    await loadStrategies();
  }

  async function deleteStrategy(strategy: Strategy) {
    await fetch(`/api/strategies/${encodeURIComponent(strategy.id)}`, { method: "DELETE" });
    if (form.id === strategy.id) {
      setForm(EMPTY_FORM);
    }
    await loadStrategies();
  }

  return (
    <>
    <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="rounded border border-slate-800 bg-panel">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-base font-semibold text-white">{editing ? "编辑策略" : "创建策略"}</h2>
          {editing && (
            <button className="text-xs text-cyan-300 hover:text-cyan-100" onClick={() => setForm(EMPTY_FORM)} type="button">
              新建
            </button>
          )}
        </div>
        <div className="space-y-3 p-4">
          {error && <div className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
          <TextInput label="策略名称" onChange={(name) => setForm((prev) => ({ ...prev, name }))} value={form.name} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectInput
              label="类型"
              onChange={(strategyType) => setForm((prev) => ({ ...prev, strategyType: strategyType as StrategyType }))}
              options={["SpotPerp", "CrossExchange"]}
              value={form.strategyType}
            />
            <SelectInput
              label="状态"
              onChange={(status) => setForm((prev) => ({ ...prev, status: status as StrategyStatus }))}
              options={["draft", "running", "paused", "stopped"]}
              value={form.status}
            />
          </div>
          <TextInput label="币种" onChange={(symbol) => setForm((prev) => ({ ...prev, symbol }))} value={form.symbol} />

          {form.strategyType === "SpotPerp" ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectInput label="现货交易所" onChange={(spotExchange) => setForm((prev) => ({ ...prev, spotExchange: spotExchange as ExchangeName }))} options={EXCHANGES} value={form.spotExchange} />
                <SelectInput label="永续交易所" onChange={(perpExchange) => setForm((prev) => ({ ...prev, perpExchange: perpExchange as ExchangeName }))} options={EXCHANGES} value={form.perpExchange} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <NumberInput label="最低 Funding" onChange={(minFundingRate) => setForm((prev) => ({ ...prev, minFundingRate }))} step="0.0001" value={form.minFundingRate} />
                <NumberInput label="最低年化" onChange={(minAnnualized) => setForm((prev) => ({ ...prev, minAnnualized }))} step="1" value={form.minAnnualized} />
                <NumberInput label="最大杠杆" onChange={(maxLeverage) => setForm((prev) => ({ ...prev, maxLeverage }))} step="0.5" value={form.maxLeverage} />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectInput label="多头交易所" onChange={(longExchange) => setForm((prev) => ({ ...prev, longExchange: longExchange as ExchangeName }))} options={EXCHANGES} value={form.longExchange} />
                <SelectInput label="空头交易所" onChange={(shortExchange) => setForm((prev) => ({ ...prev, shortExchange: shortExchange as ExchangeName }))} options={EXCHANGES} value={form.shortExchange} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberInput label="最低 Funding 差" onChange={(minFundingSpread) => setForm((prev) => ({ ...prev, minFundingSpread }))} step="0.0001" value={form.minFundingSpread} />
                <NumberInput label="最低年化价差" onChange={(minAnnualizedSpread) => setForm((prev) => ({ ...prev, minAnnualizedSpread }))} step="1" value={form.minAnnualizedSpread} />
              </div>
            </div>
          )}

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
            onClick={() => void saveStrategy()}
            type="button"
          >
            <Save className="h-4 w-4" />
            {editing ? "保存修改" : "创建策略"}
          </button>
        </div>
      </section>

      <section className="rounded border border-slate-800 bg-panel">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-base font-semibold text-white">策略列表</h2>
          <span className="text-xs text-slate-500">{loading ? "加载中" : `${strategies.length} 个策略`}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <Header>名称</Header>
                <Header>类型</Header>
                <Header>币种</Header>
                <Header>交易所组合</Header>
                <Header>状态</Header>
                <Header>创建时间</Header>
                <Header>更新时间</Header>
                <Header>操作</Header>
              </tr>
            </thead>
            <tbody>
              {sortedStrategies.map((strategy) => (
                <tr className="border-b border-slate-800/70 hover:bg-slate-800/40" key={strategy.id}>
                  <Cell strong>
                    <button className="text-left text-cyan-300 hover:text-cyan-100" onClick={() => setForm(toForm(strategy))} type="button">
                      {strategy.name}
                    </button>
                  </Cell>
                  <Cell>{formatStrategyType(strategy.strategyType)}</Cell>
                  <Cell>{strategy.symbol}</Cell>
                  <Cell>{strategy.exchangePair}</Cell>
                  <Cell className={getStatusClass(strategy.status)}>{strategy.status}</Cell>
                  <Cell>{new Date(strategy.createdAt).toLocaleString()}</Cell>
                  <Cell>{new Date(strategy.updatedAt).toLocaleString()}</Cell>
                  <Cell>
                    <div className="flex items-center gap-1">
                      {STATUS_ACTIONS.map((action) => {
                        const Icon = action.icon;
                        return (
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-700 text-slate-300 hover:border-cyan-400 hover:text-cyan-100"
                            key={action.status}
                            onClick={() => void patchStatus(strategy, action.status)}
                            title={action.label}
                            type="button"
                          >
                            <Icon className="h-4 w-4" />
                          </button>
                        );
                      })}
                      <button
                        className="inline-flex h-8 w-8 items-center justify-center rounded border border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                        onClick={() => void deleteStrategy(strategy)}
                        title="Delete"
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </Cell>
                </tr>
              ))}
              {sortedStrategies.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-slate-500" colSpan={8}>
                    No strategies yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    {/* ── Paper Trading Templates ───────────────────────────── */}
    <section className="mt-6 border border-slate-800 bg-slate-950/40">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-base font-semibold text-white">Paper Trading 策略模板</h2>
        <p className="mt-1 text-xs text-slate-500">
          策略模板仅影响模拟执行的默认参数，不会实盘下单。当前最多启用一个模板。
        </p>
      </div>

      {paperTemplates.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-500">正在加载...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <Header>名称</Header>
                <Header>描述</Header>
                <Header>最低评分</Header>
                <Header>最大风险</Header>
                <Header>最低净年化</Header>
                <Header>最大开仓</Header>
                <Header>默认名义本金</Header>
                <Header>手续费率</Header>
                <Header>状态</Header>
                <Header>操作</Header>
              </tr>
            </thead>
            <tbody>
              {paperTemplates.map((tpl) => (
                <tr className="border-b border-slate-800/70 hover:bg-slate-800/40" key={tpl.id}>
                  <Cell strong>{tpl.name}</Cell>
                  <Cell><span className="max-w-[180px] truncate text-slate-400" title={tpl.description}>{tpl.description}</span></Cell>
                  <Cell>{tpl.minScore}</Cell>
                  <Cell>{tpl.maxRiskLevel}</Cell>
                  <Cell>{tpl.minAnnualizedNetRate}%</Cell>
                  <Cell>{tpl.maxOpenExecutions}</Cell>
                  <Cell>{formatUsd(tpl.defaultNotionalUsd)}</Cell>
                  <Cell>{(tpl.feeRate * 100).toFixed(2)}%</Cell>
                  <Cell>
                    <span className={tpl.enabledPaperTrading ? "text-emerald-300" : "text-slate-500"}>
                      {tpl.enabledPaperTrading ? "启用" : "停用"}
                    </span>
                  </Cell>
                  <Cell>
                    <div className="flex items-center gap-1">
                      {tpl.enabledPaperTrading ? (
                        <button
                          className="inline-flex h-7 items-center gap-1 border border-slate-700 px-2 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-200"
                          onClick={() => deactivatePaperStrategyTemplate()}
                          type="button"
                        >
                          停用
                        </button>
                      ) : (
                        <button
                          className="inline-flex h-7 items-center gap-1 border border-cyan-400/50 bg-cyan-400/10 px-2 text-xs text-cyan-100 hover:bg-cyan-400/20"
                          onClick={() => activatePaperStrategyTemplate(tpl.id)}
                          type="button"
                        >
                          启用
                        </button>
                      )}
                    </div>
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
    </>
  );
}

function buildPayload(form: StrategyFormState) {
  if (form.strategyType === "SpotPerp") {
    return {
      name: form.name,
      strategyType: "SpotPerp",
      symbol: form.symbol,
      spotExchange: form.spotExchange,
      perpExchange: form.perpExchange,
      minFundingRate: form.minFundingRate,
      minAnnualized: form.minAnnualized,
      maxLeverage: form.maxLeverage,
      status: form.status,
      notes: form.notes
    };
  }

  return {
    name: form.name,
    strategyType: "CrossExchange",
    symbol: form.symbol,
    longExchange: form.longExchange,
    shortExchange: form.shortExchange,
    minFundingSpread: form.minFundingSpread,
    minAnnualizedSpread: form.minAnnualizedSpread,
    status: form.status,
    notes: form.notes
  };
}

function toForm(strategy: Strategy): StrategyFormState {
  if (strategy.strategyType === "SpotPerp") {
    return {
      ...EMPTY_FORM,
      id: strategy.id,
      name: strategy.name,
      strategyType: "SpotPerp",
      symbol: strategy.symbol,
      spotExchange: strategy.spotExchange,
      perpExchange: strategy.perpExchange,
      minFundingRate: strategy.minFundingRate,
      minAnnualized: strategy.minAnnualized,
      maxLeverage: strategy.maxLeverage,
      status: strategy.status,
      notes: strategy.notes ?? ""
    };
  }

  return {
    ...EMPTY_FORM,
    id: strategy.id,
    name: strategy.name,
    strategyType: "CrossExchange",
    symbol: strategy.symbol,
    longExchange: strategy.longExchange,
    shortExchange: strategy.shortExchange,
    minFundingSpread: strategy.minFundingSpread,
    minAnnualizedSpread: strategy.minAnnualizedSpread,
    status: strategy.status,
    notes: strategy.notes ?? ""
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

function NumberInput({
  label,
  onChange,
  step,
  value
}: {
  label: string;
  onChange: (value: number) => void;
  step: string;
  value: number;
}) {
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

function SelectInput({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
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
            {formatSelectOption(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatSelectOption(option: string) {
  if (option === "SpotPerp" || option === "CrossExchange") {
    return formatStrategyType(option as StrategyType);
  }

  return option;
}

function formatStrategyType(strategyType: StrategyType) {
  return strategyType === "SpotPerp" ? "现货+永续" : "跨交易所费率差";
}

function formatUsd(value: number) {
  return `$${value.toLocaleString("en-US")}`;
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap border-b border-slate-800 px-3 py-2 font-medium">{children}</th>;
}

function Cell({
  children,
  className = "",
  strong = false
}: {
  children: React.ReactNode;
  className?: string;
  strong?: boolean;
}) {
  return <td className={`whitespace-nowrap px-3 py-2 ${strong ? "font-medium text-white" : "text-slate-200"} ${className}`}>{children}</td>;
}

function getStatusClass(status: StrategyStatus): string {
  if (status === "running") return "text-emerald-300";
  if (status === "paused") return "text-amber-300";
  if (status === "stopped") return "text-rose-300";
  return "text-slate-300";
}
