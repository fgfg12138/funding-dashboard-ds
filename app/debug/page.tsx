"use client";

import { RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/api";
import type { DebugMarketRow } from "@/lib/exchanges/types";

const LIMITED_DEBUG_MESSAGE = "\u5f53\u524d\u4ec5\u5c55\u793a\u524d 500 \u6761\uff0c\u8bf7\u4f7f\u7528\u641c\u7d22\u8fc7\u6ee4";

export default function DebugPage() {
  const [rows, setRows] = useState<DebugMarketRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/debug/markets").then((res) => res.json() as Promise<ApiResponse<DebugMarketRow[]>>);
    setRows(response.data);
    setErrors(response.errors ?? []);
    setUpdatedAt(response.updatedAt);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toUpperCase();

    if (!normalizedQuery) {
      return rows;
    }

    return rows.filter(
      (row) =>
        row.exchange.toUpperCase().includes(normalizedQuery) ||
        row.rawSymbol.toUpperCase().includes(normalizedQuery) ||
        row.normalizedSymbol.toUpperCase().includes(normalizedQuery)
    );
  }, [query, rows]);

  return (
    <main className="min-h-screen bg-surface px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1800px] space-y-4">
        <header className="flex flex-col gap-3 border-b border-slate-800 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Market Debug</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">标准化合约市场</h1>
            <p className="mt-1 text-sm text-slate-400">只读 raw exchange fields mapped to the internal funding market model.</p>
          </div>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded border border-cyan-400/50 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-wait disabled:opacity-60"
            disabled={loading}
            onClick={() => void loadData()}
            title="Refresh debug market data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        <section className="flex flex-col gap-3 border-y border-slate-800 bg-slate-950/40 py-4 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              className="h-10 w-full rounded border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
              placeholder="Search exchange, raw symbol, or normalized symbol"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            <span>{filteredRows.length} / {rows.length} rows</span>
            <span>更新时间 {updatedAt ? new Date(updatedAt).toLocaleTimeString() : "-"}</span>
            {errors.length > 0 && <span className="text-amber-300">Partial exchange fetch failure</span>}
            {filteredRows.length > 500 && <span className="text-cyan-300">{LIMITED_DEBUG_MESSAGE}</span>}
          </div>
        </section>

        <div className="overflow-x-auto rounded border border-slate-800 bg-panel">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <Header>exchange</Header>
                <Header>rawSymbol</Header>
                <Header>normalizedSymbol</Header>
                <Header>fundingRate</Header>
                <Header>annualizedRate</Header>
                <Header>markPrice</Header>
                <Header>nextFundingTime</Header>
                <Header>volume24h</Header>
                <Header>openInterestUsd</Header>
              </tr>
            </thead>
            <tbody>
              {filteredRows.slice(0, 500).map((row) => (
                <tr key={`${row.exchange}:${row.rawSymbol}`} className="border-b border-slate-800/70 hover:bg-slate-800/40">
                  <Cell>{row.exchange}</Cell>
                  <Cell>{row.rawSymbol}</Cell>
                  <Cell>{row.normalizedSymbol}</Cell>
                  <Cell><Signed value={row.fundingRate * 100} /></Cell>
                  <Cell><Signed value={row.annualizedRate} /></Cell>
                  <Cell>{formatNumber(row.markPrice)}</Cell>
                  <Cell>{formatTime(row.nextFundingTime)}</Cell>
                  <Cell>{formatUsd(row.volume24h)}</Cell>
                  <Cell>{formatUsd(row.openInterestUsd)}</Cell>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-slate-500" colSpan={9}>
                    No market rows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap border-b border-slate-800 px-3 py-2 font-medium">{children}</th>;
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="whitespace-nowrap px-3 py-2 text-slate-200">{children}</td>;
}

function Signed({ value }: { value: number }) {
  const color = value >= 0 ? "text-emerald-300" : "text-rose-300";
  return <span className={color}>{formatPercent(value)}</span>;
}

function formatPercent(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toFixed(4)}%`;
}

function formatUsd(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "-";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
}

function formatNumber(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "-";
  if (value >= 100) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function formatTime(value?: number) {
  if (!value || !Number.isFinite(value)) return "-";
  return new Date(value).toLocaleString();
}
