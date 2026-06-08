"use client";

import { RefreshCw, Save, Search, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExchangeName } from "@/lib/exchanges/types";
import type { AdlMonitorResult, AdlMonitorSummary, AdlPosition, AdlSettings, AdlSide } from "@/lib/adl/types";

type ApiEnvelope<T> = {
  status: number;
  data?: T;
  error?: string;
};

const EXCHANGES: ExchangeName[] = ["Binance", "OKX", "Bybit"];
const SIDES: Array<"all" | AdlSide> = ["all", "LONG", "SHORT"];
const MIN_LEVELS = [
  { label: "全部", value: 0 },
  { label: ">= 3", value: 3 },
  { label: ">= 4", value: 4 },
  { label: ">= 5", value: 5 }
];

const DEFAULT_SETTINGS: AdlSettings = {
  enabled: true,
  alertLevelThreshold: 5,
  repeatAlertMinutes: 30,
  pollingIntervalSeconds: 3,
  exchanges: {
    Binance: true,
    OKX: true,
    Bybit: true
  }
};

const EMPTY_SUMMARY: AdlMonitorSummary = {
  positionCount: 0,
  adlLevel5Count: 0,
  adlLevel4PlusCount: 0,
  maxAdlLevel: 0,
  latestUpdatedAt: null
};

export function AdlMonitorClient() {
  const [positions, setPositions] = useState<AdlPosition[]>([]);
  const [summary, setSummary] = useState<AdlMonitorSummary>(EMPTY_SUMMARY);
  const [settings, setSettings] = useState<AdlSettings>(DEFAULT_SETTINGS);
  const [exchangeFilter, setExchangeFilter] = useState<"all" | ExchangeName>("all");
  const [symbolFilter, setSymbolFilter] = useState("");
  const [sideFilter, setSideFilter] = useState<"all" | AdlSide>("all");
  const [minLevel, setMinLevel] = useState(0);
  const [highRiskOnly, setHighRiskOnly] = useState(false);
  const [message, setMessage] = useState("当前展示本地模拟 ADL 数据，不接真实交易所仓位。");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadMonitor = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/adl-monitor", { cache: "no-store" });
      const payload = (await response.json()) as ApiEnvelope<AdlMonitorResult>;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "failed to load ADL monitor");
      }

      setPositions(payload.data.positions);
      setSummary(payload.data.summary);
      setSettings(payload.data.settings);
      setMessage("当前展示本地模拟 ADL 数据，不接真实交易所仓位。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ADL monitor load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMonitor();
  }, [loadMonitor]);

  const filteredPositions = useMemo(() => {
    const symbolQuery = symbolFilter.trim().toUpperCase();
    const riskThreshold = settings.alertLevelThreshold;

    return positions
      .filter((position) => (exchangeFilter === "all" ? true : position.exchange === exchangeFilter))
      .filter((position) => (sideFilter === "all" ? true : position.side === sideFilter))
      .filter((position) => (symbolQuery ? position.symbol.toUpperCase().includes(symbolQuery) : true))
      .filter((position) => position.adlLevel >= minLevel)
      .filter((position) => (highRiskOnly ? position.adlLevel >= riskThreshold : true))
      .sort((a, b) => b.adlLevel - a.adlLevel || b.notionalUsd - a.notionalUsd);
  }, [exchangeFilter, highRiskOnly, minLevel, positions, settings.alertLevelThreshold, sideFilter, symbolFilter]);

  async function refreshMockData() {
    setLoading(true);
    try {
      const response = await fetch("/api/adl-monitor/mock-refresh", { method: "POST" });
      const payload = (await response.json()) as ApiEnvelope<{ positions: AdlPosition[]; summary: AdlMonitorSummary; mock: true }>;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "mock refresh failed");
      }

      setPositions(payload.data.positions);
      setSummary(payload.data.summary);
      setMessage("已生成一组模拟 ADL 仓位数据。该数据不是交易所真实仓位。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "mock refresh failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const response = await fetch("/api/adl-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      const payload = (await response.json()) as ApiEnvelope<AdlSettings>;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "settings save failed");
      }

      setSettings(payload.data);
      setMessage("ADL 设置已保存到本地配置文件。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "settings save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="border border-red-500/30 bg-red-950/20 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-red-300" />
            <div>
              <p className="text-sm font-semibold text-red-100">模拟数据中心</p>
              <p className="mt-1 text-sm text-red-100/80">
                mock-refresh 只生成本地模拟 ADL 仓位，页面不读取真实账户、不连接私钥、不执行平仓或减仓。
              </p>
            </div>
          </div>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 border border-red-400/50 bg-red-400/10 px-4 text-sm font-medium text-red-100 hover:bg-red-400/20 disabled:cursor-wait disabled:opacity-60"
            disabled={loading}
            onClick={() => void refreshMockData()}
            title="生成模拟 ADL 仓位"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            生成模拟数据
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-400">{message}</p>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="监控仓位数量" value={summary.positionCount.toLocaleString()} />
        <StatCard label="ADL >= 5" value={summary.adlLevel5Count.toLocaleString()} tone="red" />
        <StatCard label="ADL >= 4" value={summary.adlLevel4PlusCount.toLocaleString()} tone="orange" />
        <StatCard label="最高 ADL 等级" value={summary.maxAdlLevel > 0 ? String(summary.maxAdlLevel) : "-"} tone="yellow" />
        <StatCard label="最近更新时间" value={formatTime(summary.latestUpdatedAt)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="border-y border-slate-800 bg-slate-950/40 py-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[160px_minmax(220px,1fr)_160px_140px_160px]">
              <label className="space-y-1 text-sm">
                <span className="text-xs text-slate-400">交易所</span>
                <select
                  className="h-10 w-full border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                  value={exchangeFilter}
                  onChange={(event) => setExchangeFilter(event.target.value as "all" | ExchangeName)}
                >
                  <option value="all">全部</option>
                  {EXCHANGES.map((exchange) => (
                    <option key={exchange} value={exchange}>
                      {exchange}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="text-xs text-slate-400">币种</span>
                <span className="flex h-10 items-center gap-2 border border-slate-700 bg-slate-950 px-3">
                  <Search className="h-4 w-4 text-slate-500" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
                    placeholder="BTC/USDT"
                    value={symbolFilter}
                    onChange={(event) => setSymbolFilter(event.target.value)}
                  />
                </span>
              </label>

              <label className="space-y-1 text-sm">
                <span className="text-xs text-slate-400">方向</span>
                <select
                  className="h-10 w-full border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                  value={sideFilter}
                  onChange={(event) => setSideFilter(event.target.value as "all" | AdlSide)}
                >
                  {SIDES.map((side) => (
                    <option key={side} value={side}>
                      {side === "all" ? "全部" : side}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="text-xs text-slate-400">ADL 等级</span>
                <select
                  className="h-10 w-full border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                  value={minLevel}
                  onChange={(event) => setMinLevel(Number(event.target.value))}
                >
                  {MIN_LEVELS.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex h-full items-end gap-2 text-sm text-slate-200">
                <input
                  checked={highRiskOnly}
                  className="mb-3 h-4 w-4 accent-red-400"
                  type="checkbox"
                  onChange={(event) => setHighRiskOnly(event.target.checked)}
                />
                <span className="pb-2">只看高风险</span>
              </label>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <Th>交易所</Th>
                  <Th>币种</Th>
                  <Th>方向</Th>
                  <Th>ADL 等级</Th>
                  <Th align="right">仓位数量</Th>
                  <Th align="right">名义价值</Th>
                  <Th align="right">标记价格</Th>
                  <Th>策略 ID</Th>
                  <Th>更新时间</Th>
                  <Th>备注</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950/30">
                {filteredPositions.map((position) => (
                  <tr key={position.id} className="hover:bg-slate-900/70">
                    <Td>{position.exchange}</Td>
                    <Td>{position.symbol}</Td>
                    <Td>
                      <span className={position.side === "LONG" ? "text-emerald-300" : "text-red-300"}>{position.side}</span>
                    </Td>
                    <Td>
                      <span className={`inline-flex min-w-12 justify-center border px-2 py-1 text-xs font-semibold ${adlLevelClass(position.adlLevel)}`}>
                        {position.adlLevel}
                      </span>
                    </Td>
                    <Td align="right">{formatNumber(position.quantity)}</Td>
                    <Td align="right">{formatUsd(position.notionalUsd)}</Td>
                    <Td align="right">{formatUsd(position.markPrice)}</Td>
                    <Td>{position.strategyId ?? "-"}</Td>
                    <Td>{formatTime(position.updatedAt)}</Td>
                    <Td>
                      <span className="line-clamp-2 max-w-[260px] text-slate-400">{position.notes ?? "-"}</span>
                    </Td>
                  </tr>
                ))}
                {filteredPositions.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={10}>
                      没有匹配的模拟 ADL 仓位。可以点击“生成模拟数据”生成演示数据。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <SettingsPanel settings={settings} saving={saving} setSettings={setSettings} saveSettings={saveSettings} />
      </section>
    </div>
  );
}

function SettingsPanel({
  settings,
  saving,
  setSettings,
  saveSettings
}: {
  settings: AdlSettings;
  saving: boolean;
  setSettings: (settings: AdlSettings) => void;
  saveSettings: () => Promise<void>;
}) {
  return (
    <aside className="border border-slate-800 bg-slate-950/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">设置面板</h2>
          <p className="mt-1 text-xs text-slate-500">保存到 .data/adl-settings.json，仅用于本地模拟监控。</p>
        </div>
        <button
          className="inline-flex h-9 items-center gap-2 border border-cyan-400/50 bg-cyan-400/10 px-3 text-sm font-medium text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-wait disabled:opacity-60"
          disabled={saving}
          onClick={() => void saveSettings()}
          title="保存 ADL 设置"
        >
          <Save className="h-4 w-4" />
          Save
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <label className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3 text-sm text-slate-200">
          <span>enabled</span>
          <input
            checked={settings.enabled}
            className="h-4 w-4 accent-cyan-400"
            type="checkbox"
            onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
          />
        </label>

        <NumberSetting
          label="alertLevelThreshold"
          max={5}
          min={1}
          value={settings.alertLevelThreshold}
          onChange={(value) => setSettings({ ...settings, alertLevelThreshold: value as AdlSettings["alertLevelThreshold"] })}
        />
        <NumberSetting
          label="repeatAlertMinutes"
          min={1}
          value={settings.repeatAlertMinutes}
          onChange={(value) => setSettings({ ...settings, repeatAlertMinutes: value })}
        />
        <NumberSetting
          label="pollingIntervalSeconds"
          min={1}
          value={settings.pollingIntervalSeconds}
          onChange={(value) => setSettings({ ...settings, pollingIntervalSeconds: value })}
        />

        <div className="space-y-3 border-t border-slate-800 pt-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">exchanges</p>
          {EXCHANGES.map((exchange) => (
            <label key={exchange} className="flex items-center justify-between gap-3 text-sm text-slate-200">
              <span>{exchange}</span>
              <input
                checked={settings.exchanges[exchange]}
                className="h-4 w-4 accent-cyan-400"
                type="checkbox"
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    exchanges: {
                      ...settings.exchanges,
                      [exchange]: event.target.checked
                    }
                  })
                }
              />
            </label>
          ))}
        </div>
      </div>
    </aside>
  );
}

function NumberSetting({
  label,
  max,
  min,
  value,
  onChange
}: {
  label: string;
  max?: number;
  min: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-xs text-slate-400">{label}</span>
      <input
        className="h-10 w-full border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
        max={max}
        min={min}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function StatCard({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "yellow" | "orange" | "red" }) {
  const toneClass = {
    slate: "text-slate-100",
    yellow: "text-yellow-200",
    orange: "text-orange-200",
    red: "text-red-200"
  }[tone];

  return (
    <div className="border border-slate-800 bg-slate-950/50 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function Th({ align = "left", children }: { align?: "left" | "right"; children: ReactNode }) {
  return <th className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}

function Td({ align = "left", children }: { align?: "left" | "right"; children: ReactNode }) {
  return <td className={`whitespace-nowrap px-4 py-3 ${align === "right" ? "text-right tabular-nums" : "text-left"}`}>{children}</td>;
}

function adlLevelClass(level: number) {
  if (level >= 5) return "border-red-400/60 bg-red-400/15 text-red-200";
  if (level >= 4) return "border-orange-400/60 bg-orange-400/15 text-orange-200";
  if (level >= 3) return "border-yellow-400/60 bg-yellow-400/15 text-yellow-200";
  if (level >= 2) return "border-emerald-400/50 bg-emerald-400/10 text-emerald-200";
  return "border-slate-600 bg-slate-800/60 text-slate-300";
}

function formatUsd(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 0 : 4 })}`;
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatTime(value: number | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}
