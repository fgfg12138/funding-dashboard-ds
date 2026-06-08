"use client";

import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { RiskBadge, ScoreBadge, SkeletonRows, SkeletonStatCards, StatCard } from "@/components/ui/dashboard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { BasisOpportunity } from "@/lib/basis/types";
import type { ExchangeName } from "@/lib/exchanges/types";
import { applySort, parseSortState, sortIndicator, toggleSortState, type SortOrder } from "@/lib/tableSort/tableSort";

type BasisApiResponse = {
  data: BasisOpportunity[];
  errors?: string[];
  stale?: boolean;
  updatedAt: number;
};

const EXCHANGES: Array<"all" | ExchangeName> = ["all", "Binance", "OKX", "Bybit"];
type BasisSortKey = "score" | "annualizedFundingRate" | "estimatedCarryAnnualized" | "basisPercent" | "volume24h" | "openInterestUsd" | "nextFundingTime";
const BASIS_SORTS: BasisSortKey[] = ["score", "annualizedFundingRate", "estimatedCarryAnnualized", "basisPercent", "volume24h", "openInterestUsd", "nextFundingTime"];

export default function BasisPage() {
  const [rows, setRows] = useState<BasisOpportunity[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const requestInFlight = useRef(false);
  const [search, setSearch] = useState("");
  const [exchange, setExchange] = useState<"all" | ExchangeName>("all");
  const [minAnnualized, setMinAnnualized] = useState(0);
  const [minVolume, setMinVolume] = useState(1_000_000);
  const [maxAbsBasis, setMaxAbsBasis] = useState(2);
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<BasisSortKey>("estimatedCarryAnnualized");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  useEffect(() => {
    const syncSortFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const parsed = parseSortState<BasisSortKey>({
        allowedSorts: BASIS_SORTS,
        defaultOrder: "desc",
        defaultSort: "estimatedCarryAnnualized",
        order: params.get("order"),
        sort: params.get("sort")
      });
      setSortBy(parsed.sort);
      setSortOrder(parsed.order);
    };

    syncSortFromUrl();
    window.addEventListener("popstate", syncSortFromUrl);
    return () => window.removeEventListener("popstate", syncSortFromUrl);
  }, []);

  const loadData = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setLoading(true);
    try {
      const response = await fetch("/api/basis/opportunities", { cache: "no-store" });
      const payload = (await response.json()) as BasisApiResponse;
      setRows(payload.data ?? []);
      setErrors(payload.errors ?? []);
      setStale(Boolean(payload.stale));
      setUpdatedAt(payload.updatedAt ?? Date.now());
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "数据加载失败，请稍后重试。"]);
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(), 60_000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toUpperCase();
    return rows
      .filter((row) => (query ? row.symbol.includes(query) || row.base.includes(query) : true))
      .filter((row) => (exchange === "all" ? true : row.spotExchange === exchange || row.perpExchange === exchange))
      .filter((row) => row.annualizedFundingRate >= minAnnualized)
      .filter((row) => (row.volume24h ?? 0) >= minVolume)
      .filter((row) => Math.abs(row.basisPercent) <= maxAbsBasis)
      .filter((row) => (recommendedOnly ? isRecommended(row) : true));
  }, [exchange, maxAbsBasis, minAnnualized, minVolume, recommendedOnly, rows, search]);
  const sortedRows = useMemo(() => applySort(filteredRows, { sort: sortBy, order: sortOrder }, {
    annualizedFundingRate: (row) => row.annualizedFundingRate,
    basisPercent: (row) => Math.abs(row.basisPercent),
    estimatedCarryAnnualized: (row) => row.estimatedCarryAnnualized,
    nextFundingTime: (row) => row.nextFundingTime,
    openInterestUsd: (row) => row.openInterestUsd,
    score: (row) => row.score,
    volume24h: (row) => row.volume24h
  }), [filteredRows, sortBy, sortOrder]);

  const stats = useMemo(() => buildStats(rows), [rows]);

  const updateSort = useCallback((nextSort: BasisSortKey) => {
    const next = toggleSortState({ sort: sortBy, order: sortOrder }, nextSort);
    const params = new URLSearchParams(window.location.search);
    params.set("sort", next.sort);
    params.set("order", next.order);
    window.history.pushState(null, "", `/basis?${params.toString()}`);
    setSortBy(next.sort);
    setSortOrder(next.order);
  }, [sortBy, sortOrder]);

  return (
    <PageShell
      activeHref="/basis"
      description="买现货 + 空永续的只读基差看板，只调用公开行情，不接 API Key，不下单。"
      eyebrow="Basis / 基差看板"
      loading={loading}
      onRefresh={() => void loadData()}
      title="基差看板"
      updatedAt={updatedAt}
    >
      <ErrorBoundary>
      {loading && rows.length === 0 ? (
        <SkeletonStatCards count={5} />
      ) : (
        <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="机会数量" value={stats.count.toLocaleString()} />
          <StatCard label="最高年化资金费率" value={`${formatPercent(stats.maxAnnualized)}%`} tone="green" />
          <StatCard label="最高估算Carry" value={`${formatPercent(stats.maxCarry)}%`} tone="cyan" />
          <StatCard label="价差超过 1%" value={stats.wideBasisCount.toLocaleString()} tone="orange" />
          <StatCard label="推荐机会" value={stats.recommendedCount.toLocaleString()} tone="yellow" />
        </section>
      )}

      <section className="border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
        估算 Carry 为简化模型，未扣手续费、滑点和 Funding 变化风险；本页仅用于只读看盘，不构成交易执行。
      </section>

      <section className="border border-slate-800 bg-slate-950/40 p-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_140px_150px_150px_140px_160px]">
          <label className="space-y-1 text-sm">
            <span className="text-xs text-slate-400">搜索币种</span>
            <span className="flex h-9 items-center gap-2 border border-slate-700 bg-slate-950 px-3">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
                placeholder="BTC/USDT"
                value={search}
                onChange={(event) => setSearch(event.target.value.toUpperCase())}
              />
            </span>
          </label>
          <SelectFilter label="交易所" value={exchange} onChange={(value) => setExchange(value as "all" | ExchangeName)}>
            {EXCHANGES.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "全部" : item}
              </option>
            ))}
          </SelectFilter>
          <NumberFilter label="最低年化" step={1} value={minAnnualized} onChange={setMinAnnualized} />
          <NumberFilter label="最低24h成交量" step={1000000} value={minVolume} onChange={setMinVolume} />
          <NumberFilter label="最大绝对基差" step={0.1} value={maxAbsBasis} onChange={setMaxAbsBasis} />
          <label className="flex h-full items-end gap-2 text-sm text-slate-200">
            <input checked={recommendedOnly} className="mb-3 h-4 w-4 accent-cyan-400" type="checkbox" onChange={(event) => setRecommendedOnly(event.target.checked)} />
            <span className="pb-2">只看推荐</span>
          </label>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
          <span>当前行数: {filteredRows.length}</span>
          <span>只读 / 不交易 / 无 API Key</span>
        </div>
        {errors.length > 0 || stale ? (
          <p className="mt-2 border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            {errors.length > 0 ? "部分交易所数据获取失败，当前展示可用数据。" : null}
            {stale ? " 当前为缓存数据。" : null}
          </p>
        ) : null}
      </section>

      <section className="max-h-[520px] overflow-auto border border-slate-800 bg-slate-950/30">
        <table className="min-w-[1500px] divide-y divide-slate-800 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-950 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <SortableTh align="right" current={{ sort: sortBy, order: sortOrder }} onSort={updateSort} sort="score">评分</SortableTh>
              <Th>风险</Th>
              <Th>币种</Th>
              <Th>交易所</Th>
              <Th align="right">现货价格</Th>
              <Th align="right">永续价格</Th>
              <SortableTh align="right" current={{ sort: sortBy, order: sortOrder }} onSort={updateSort} sort="basisPercent">Basis %</SortableTh>
              <Th align="right">Funding</Th>
              <SortableTh align="right" current={{ sort: sortBy, order: sortOrder }} onSort={updateSort} sort="annualizedFundingRate">年化</SortableTh>
              <SortableTh align="right" current={{ sort: sortBy, order: sortOrder }} onSort={updateSort} sort="estimatedCarryAnnualized">估算Carry</SortableTh>
              <SortableTh align="right" current={{ sort: sortBy, order: sortOrder }} onSort={updateSort} sort="volume24h">24h成交量</SortableTh>
              <SortableTh align="right" current={{ sort: sortBy, order: sortOrder }} onSort={updateSort} sort="openInterestUsd">持仓量</SortableTh>
              <Th>下次资金费率</Th>
              <Th>原因</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950/30">
            {loading && rows.length === 0 ? <SkeletonRows colSpan={14} rowCount={5} /> : null}
            {sortedRows.map((row) => (
              <tr key={`${row.spotExchange}:${row.symbol}`} className="hover:bg-slate-900/70">
                <Td align="right"><ScoreBadge score={row.score} /></Td>
                <Td><RiskTags tags={row.riskTags} /></Td>
                <Td>{row.symbol}</Td>
                <Td>{row.spotExchange}</Td>
                <Td align="right">{formatUsd(row.spotPrice)}</Td>
                <Td align="right">{formatUsd(row.perpPrice)}</Td>
                <Td align="right">
                  <span className={Math.abs(row.basisPercent) >= 1 ? "text-orange-300" : "text-slate-200"}>{formatPercent(row.basisPercent)}%</span>
                </Td>
                <Td align="right">{(row.fundingRate * 100).toFixed(4)}%</Td>
                <Td align="right">
                  <span className={row.annualizedFundingRate >= 90 ? "text-orange-300" : "text-emerald-300"}>{formatPercent(row.annualizedFundingRate)}%</span>
                </Td>
                <Td align="right">
                  <span className={row.estimatedCarryAnnualized > 0 ? "text-cyan-300" : "text-red-300"}>{formatPercent(row.estimatedCarryAnnualized)}%</span>
                </Td>
                <Td align="right">{formatCompactUsd(row.volume24h)}</Td>
                <Td align="right">{formatCompactUsd(row.openInterestUsd)}</Td>
                <Td>{formatTime(row.nextFundingTime)}</Td>
                <Td>
                  <span className="line-clamp-2 max-w-[360px] text-slate-400" title={row.opportunityReason}>{row.opportunityReason}</span>
                </Td>
              </tr>
            ))}
            {!loading && filteredRows.length === 0 ? <EmptyRow colSpan={14} label="暂无符合条件的同交易所正资金费率基差机会。" /> : null}
          </tbody>
        </table>
      </section>
      </ErrorBoundary>
    </PageShell>
  );
}

function buildStats(rows: BasisOpportunity[]) {
  return {
    count: rows.length,
    maxAnnualized: Math.max(0, ...rows.map((row) => row.annualizedFundingRate)),
    maxCarry: Math.max(0, ...rows.map((row) => row.estimatedCarryAnnualized)),
    wideBasisCount: rows.filter((row) => Math.abs(row.basisPercent) > 1).length,
    recommendedCount: rows.filter(isRecommended).length
  };
}

function isRecommended(row: BasisOpportunity) {
  return row.score >= 60 && (row.volume24h ?? 0) >= 1_000_000 && Math.abs(row.basisPercent) <= 1 && row.estimatedCarryAnnualized > 0;
}

function SelectFilter({ children, label, onChange, value }: { children: ReactNode; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-xs text-slate-400">{label}</span>
      <select className="h-9 w-full border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100" value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function NumberFilter({ label, onChange, step, value }: { label: string; onChange: (value: number) => void; step: number; value: number }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-xs text-slate-400">{label}</span>
      <input className="h-9 w-full border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100" min={0} step={step} type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function RiskTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <span className="text-slate-500">-</span>;
  return (
    <div className="flex max-w-[240px] flex-wrap gap-1">
      {tags.slice(0, 3).map((tag) => <RiskBadge key={tag} label={tag} />)}
    </div>
  );
}

function Th({ align = "left", children }: { align?: "left" | "right"; children: ReactNode }) {
  return <th className={`whitespace-nowrap px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}

function SortableTh({
  align = "left",
  children,
  current,
  onSort,
  sort
}: {
  align?: "left" | "right";
  children: ReactNode;
  current: { sort: BasisSortKey; order: SortOrder };
  onSort: (sort: BasisSortKey) => void;
  sort: BasisSortKey;
}) {
  return (
    <th className={`whitespace-nowrap px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      <button className="text-inherit hover:text-cyan-200" onClick={() => onSort(sort)} type="button">
        {children}{sortIndicator(current, sort)}
      </button>
    </th>
  );
}

function Td({ align = "left", children }: { align?: "left" | "right"; children: ReactNode }) {
  return <td className={`px-4 py-3 align-top tabular-nums ${align === "right" ? "text-right" : "text-left"}`}>{children}</td>;
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={colSpan}>{label}</td>
    </tr>
  );
}

function formatPercent(value: number) {
  return value.toFixed(2);
}

function formatUsd(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "-";
  return value >= 100 ? value.toFixed(2) : value.toPrecision(6);
}

function formatCompactUsd(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "-";
  return Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 1, notation: "compact", style: "currency" }).format(value);
}

function formatTime(value: number | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}
