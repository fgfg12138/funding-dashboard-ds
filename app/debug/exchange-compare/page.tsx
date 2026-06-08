"use client";

import { Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import type { ExchangeCompareRow } from "@/lib/debug/exchangeCompare";

type CompareResponse = {
  data: ExchangeCompareRow[];
  errors?: string[];
  stale?: boolean;
  updatedAt?: number;
  symbol?: string;
};

export default function ExchangeComparePage() {
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [query, setQuery] = useState("BTC/USDT");
  const [rows, setRows] = useState<ExchangeCompareRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (nextSymbol = symbol) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/debug/exchange-compare?symbol=${encodeURIComponent(nextSymbol)}`, { cache: "no-store" });
      const payload = (await response.json()) as CompareResponse;
      setRows(payload.data ?? []);
      setErrors(payload.errors ?? []);
      setStale(Boolean(payload.stale));
      setUpdatedAt(payload.updatedAt ?? Date.now());
      setSymbol(payload.symbol ?? nextSymbol);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "数据加载失败"]);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void loadData(query.trim() || "BTC/USDT");
  };

  return (
    <PageShell
      activeHref="/dashboard"
      description="对照 Binance / OKX / Bybit 的标准化字段、来源端点和关键原始字段，用于人工校验交易所官网。"
      eyebrow="Exchange Data Accuracy"
      loading={loading}
      onRefresh={() => void loadData(symbol)}
      title="交易所数据校准"
      updatedAt={updatedAt}
    >
      <section className="space-y-3 border border-slate-800 bg-slate-950/40 p-3">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              className="h-9 w-full border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
              placeholder="BTC/USDT、ETH/USDT、OPN/USDT"
              value={query}
              onChange={(event) => setQuery(event.target.value.toUpperCase())}
            />
          </label>
          <button className="h-9 border border-cyan-400/50 bg-cyan-400/10 px-4 text-sm text-cyan-100 hover:bg-cyan-400/20" type="submit">
            校准查询
          </button>
        </form>
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          <span>当前币种：{symbol}</span>
          {stale ? <span className="text-amber-300">缓存数据，可能滞后</span> : <span className="text-emerald-300">fresh</span>}
          {errors.length > 0 ? <span className="text-amber-300">部分交易所数据获取失败，当前展示可用数据。</span> : null}
        </div>
      </section>

      <section className="max-h-[620px] overflow-auto border border-slate-800 bg-panel">
        <table className="min-w-[1800px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400">
            <tr>
              {[
                "交易所",
                "rawSymbol",
                "normalizedSymbol",
                "fundingRate",
                "fundingRatePercent",
                "annualizedRate",
                "fundingIntervalHours",
                "nextFundingTime",
                "markPrice",
                "indexPrice",
                "lastPrice",
                "spotPrice",
                "perpVolume24h",
                "spotVolume24h",
                "openInterest",
                "openInterestUsd",
                "fetchedAt",
                "sourceUpdatedAt",
                "latency",
                "sourceEndpoint",
                "rawFields"
              ].map((header) => (
                <th className="whitespace-nowrap px-3 py-2" key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading && rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={21}>数据加载中...</td></tr>
            ) : null}
            {rows.map((row) => (
              <tr className="hover:bg-slate-900/70" key={row.exchange}>
                <td className="px-3 py-2 font-semibold text-slate-100">{row.exchange}</td>
                <Cell>{row.rawSymbol}</Cell>
                <Cell>{row.normalizedSymbol}</Cell>
                <Num>{row.fundingRate}</Num>
                <Num>{row.fundingRatePercent}</Num>
                <Num>{row.annualizedRate}</Num>
                <Num>{row.fundingIntervalHours}</Num>
                <Cell>{formatTime(row.nextFundingTime)}</Cell>
                <Num>{row.markPrice}</Num>
                <Num>{row.indexPrice}</Num>
                <Num>{row.lastPrice}</Num>
                <Num>{row.spotPrice}</Num>
                <Num>{row.perpVolume24h}</Num>
                <Num>{row.spotVolume24h}</Num>
                <Num>{row.openInterest}</Num>
                <Num>{row.openInterestUsd}</Num>
                <Cell>{formatTime(row.fetchedAt)}</Cell>
                <Cell>{formatTime(row.sourceUpdatedAt)}</Cell>
                <Cell>{row.latencyMs === undefined ? "-" : `${Math.round(row.latencyMs / 1000)}s`}</Cell>
                <Cell><span className="line-clamp-2 max-w-[360px]" title={row.sourceEndpoint}>{row.sourceEndpoint ?? "-"}</span></Cell>
                <Cell><pre className="max-h-28 max-w-[420px] overflow-auto whitespace-pre-wrap text-[11px] text-slate-400">{JSON.stringify(row.rawFields, null, 2)}</pre></Cell>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={21}>暂无校准数据。</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </PageShell>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-top text-slate-300">{children ?? "-"}</td>;
}

function Num({ children }: { children: number | undefined }) {
  return <td className="px-3 py-2 text-right align-top tabular-nums text-slate-200">{formatNumber(children)}</td>;
}

function formatNumber(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) return "-";
  if (Math.abs(value) >= 1_000_000) return Intl.NumberFormat("en-US", { maximumFractionDigits: 2, notation: "compact" }).format(value);
  return Number.isInteger(value) ? value.toString() : value.toPrecision(8);
}

function formatTime(value?: number) {
  if (!value || !Number.isFinite(value)) return "-";
  return new Date(value).toLocaleString();
}
