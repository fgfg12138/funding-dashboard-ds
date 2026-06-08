"use client";

import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "@/components/PageShell";
import {
  DataTableShell,
  ExchangeBadge,
  FilterPanel,
  RiskBadge,
  ScoreBadge,
  SkeletonRows,
  SkeletonStatCards,
  StatCard
} from "@/components/ui/dashboard";
import { calculateOpportunityRanking } from "@/lib/opportunityRanking/opportunityRankingEngine";
import type { OpportunityRankingTier } from "@/lib/opportunityRanking/opportunityRankingTypes";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { formatExchangeCoverage, getExchangeCoverageTitle } from "@/lib/exchanges/exchangeCoverage";
import type { ExchangeName } from "@/lib/exchanges/types";
import type { UnifiedOpportunity, UnifiedOpportunityFilters, UnifiedOpportunitySortBy, UnifiedOpportunityType } from "@/lib/opportunities/types";
import { filterUnifiedOpportunities, isHighRiskUnifiedOpportunity, isRecommendedUnifiedOpportunity } from "@/lib/opportunities/unifiedOpportunities";
import { applySort, parseSortState, sortIndicator, toggleSortState, type SortOrder } from "@/lib/tableSort/tableSort";

type SourceSnapshotMeta = {
  fundingMarketCount: number;
  spotMarketCount: number;
  crossCount: number;
  spotPerpCount: number;
  basisCount: number;
  unifiedCount: number;
  errors: string[];
};

type OpportunitiesApiResponse = {
  data: UnifiedOpportunity[];
  errors?: string[];
  stale?: boolean;
  updatedAt: number;
  meta?: SourceSnapshotMeta;
};

type QuickMode = "all" | UnifiedOpportunityType | "recommended" | "highRisk";

const TYPES: Array<"all" | UnifiedOpportunityType> = ["all", "CrossExchange", "SpotPerp", "Basis"];
const EXCHANGES: Array<"all" | ExchangeName> = ["all", "Binance", "OKX", "Bybit"];
const QUICK_MODES: Array<{ label: string; value: QuickMode }> = [
  { label: "全部", value: "all" },
  { label: "跨所费率差", value: "CrossExchange" },
  { label: "现货+永续", value: "SpotPerp" },
  { label: "Basis", value: "Basis" },
  { label: "推荐", value: "recommended" },
  { label: "高风险", value: "highRisk" }
];
const SORT_OPTIONS: Array<{ label: string; value: UnifiedOpportunitySortBy }> = [
  { label: "评分", value: "score" },
  { label: "年化", value: "annualizedRate" },
  { label: "估算Carry", value: "estimatedCarryAnnualized" },
  { label: "成交量", value: "volume24h" },
  { label: "持仓量", value: "openInterestUsd" },
  { label: "下次资金费率", value: "nextFundingTime" },
  { label: "覆盖交易所", value: "exchangeCoverage" }
];
const OPPORTUNITY_SORTS: UnifiedOpportunitySortBy[] = ["score", "annualizedRate", "estimatedCarryAnnualized", "volume24h", "openInterestUsd", "nextFundingTime", "exchangeCoverage"];
export default function OpportunitiesPage() {
  const [rows, setRows] = useState<UnifiedOpportunity[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [meta, setMeta] = useState<SourceSnapshotMeta | null>(null);
  const [stale, setStale] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const requestInFlight = useRef(false);
  const [quickMode, setQuickMode] = useState<QuickMode>("all");
  const [search, setSearch] = useState("");
  const [opportunityType, setOpportunityType] = useState<"all" | UnifiedOpportunityType>("all");
  const [exchange, setExchange] = useState<"all" | ExchangeName>("all");
  const [minScore, setMinScore] = useState(0);
  const [minAnnualized, setMinAnnualized] = useState(0);
  const [minVolume24h, setMinVolume24h] = useState(1_000_000);
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [hideHighRisk, setHideHighRisk] = useState(false);
  const [sortBy, setSortBy] = useState<UnifiedOpportunitySortBy>("score");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  useEffect(() => {
    const syncSortFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const parsed = parseSortState<UnifiedOpportunitySortBy>({
        allowedSorts: OPPORTUNITY_SORTS,
        defaultOrder: "desc",
        defaultSort: "score",
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
      const response = await fetch("/api/opportunities", { cache: "no-store" });
      const payload = (await response.json()) as OpportunitiesApiResponse;
      setRows(payload.data ?? []);
      setErrors(payload.errors ?? []);
      setStale(Boolean(payload.stale));
      setMeta(payload.meta ?? null);
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

  const filters: UnifiedOpportunityFilters = {
    search,
    opportunityType: quickMode === "CrossExchange" || quickMode === "SpotPerp" || quickMode === "Basis" ? quickMode : opportunityType,
    exchange,
    minScore,
    minAnnualized,
    minVolume24h,
    recommendedOnly: recommendedOnly || quickMode === "recommended",
    hideHighRisk,
    sortBy
  };

  const filteredRows = useMemo(() => {
    const baseRows = filterUnifiedOpportunities(rows, filters);
    const visibleRows = quickMode === "highRisk" ? baseRows.filter(isHighRiskUnifiedOpportunity) : baseRows;
    return applySort(visibleRows, { sort: sortBy, order: sortOrder }, {
      annualizedRate: (row) => row.annualizedRate,
      estimatedCarryAnnualized: (row) => row.estimatedCarryAnnualized,
      exchangeCoverage: (row) => getOpportunityExchanges(row).length,
      nextFundingTime: (row) => row.nextFundingTime,
      openInterestUsd: (row) => row.openInterestUsd,
      score: (row) => row.score,
      volume24h: (row) => row.volume24h
    });
  }, [exchange, hideHighRisk, minAnnualized, minScore, minVolume24h, opportunityType, quickMode, recommendedOnly, rows, search, sortBy, sortOrder]);  const stats = useMemo(() => buildStats(rows), [rows]);

  // Ranking tier computation for display
  const rankedMap = useMemo(() => {
    const map = new Map<string, OpportunityRankingTier>();
    for (const row of rows) {
      const ranking = calculateOpportunityRanking(row);
      map.set(row.id, ranking.rankingTier);
    }
    return map;
  }, [rows]);

  const updateSort = useCallback((nextSort: UnifiedOpportunitySortBy) => {
    const next = toggleSortState({ sort: sortBy, order: sortOrder }, nextSort);
    const params = new URLSearchParams(window.location.search);
    params.set("sort", next.sort);
    params.set("order", next.order);
    window.history.pushState(null, "", `/opportunities?${params.toString()}`);
    setSortBy(next.sort);
    setSortOrder(next.order);
  }, [sortBy, sortOrder]);

  return (
    <PageShell
      activeHref="/opportunities"
      description="只读多交易所 Funding 与 Basis 机会看板，只展示公开行情和计算结果。"
      eyebrow="V1 主看板"
      loading={loading}
      onRefresh={() => void loadData()}
      title="机会总览"
      updatedAt={updatedAt}
    >
      <ErrorBoundary>
      {loading && rows.length === 0 ? (
        <SkeletonStatCards count={7} />
      ) : (
        <section className="grid gap-2 md:grid-cols-3 xl:grid-cols-7">
          <StatCard label="总机会数" value={stats.total.toLocaleString()} />
          <StatCard label="推荐机会" value={stats.recommended.toLocaleString()} tone="cyan" />
          <StatCard label="最高评分" value={stats.highestScore.toLocaleString()} tone="green" />
          <StatCard label="最高年化" value={`${formatPercent(stats.highestAnnualized)}%`} tone="yellow" />
          <StatCard label="高风险" value={stats.highRisk.toLocaleString()} tone="orange" />
          <StatCard label="合约市场数" value={(meta?.fundingMarketCount ?? 0).toLocaleString()} />
          <StatCard label="现货市场数" value={(meta?.spotMarketCount ?? 0).toLocaleString()} />
        </section>
      )}

      <section className="flex gap-1 overflow-x-auto border-y border-slate-800 bg-slate-950/40 px-2 py-2">
        {QUICK_MODES.map((mode) => (
          <button
            className={`whitespace-nowrap border px-3 py-1.5 text-xs ${
              quickMode === mode.value
                ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-100"
            }`}
            key={mode.value}
            onClick={() => setQuickMode(mode.value)}
            type="button"
          >
            {mode.label}
          </button>
        ))}
      </section>

      <FilterPanel
        footer={
          <>
            <span>当前行数: {filteredRows.length.toLocaleString()}</span>
            <span>跨所: {meta?.crossCount?.toLocaleString() ?? "-"}</span>
            <span>现货+永续: {meta?.spotPerpCount?.toLocaleString() ?? "-"}</span>
            <span>Basis: {meta?.basisCount?.toLocaleString() ?? "-"}</span>
            <span>统一机会: {meta?.unifiedCount?.toLocaleString() ?? "-"}</span>
            <span>只读 / 无 API Key / 不交易 / 不执行</span>
          </>
        }
      >
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
        <SelectFilter label="类型" value={opportunityType} onChange={(value) => setOpportunityType(value as "all" | UnifiedOpportunityType)}>
          {TYPES.map((item) => (
            <option key={item} value={item}>
              {formatType(item)}
            </option>
          ))}
        </SelectFilter>
        <SelectFilter label="交易所" value={exchange} onChange={(value) => setExchange(value as "all" | ExchangeName)}>
          {EXCHANGES.map((item) => (
            <option key={item} value={item}>
              {item === "all" ? "全部" : item}
            </option>
          ))}
        </SelectFilter>
        <NumberFilter label="最低评分" step={5} value={minScore} onChange={setMinScore} />
        <NumberFilter label="最低年化" step={5} value={minAnnualized} onChange={setMinAnnualized} />
        <NumberFilter label="最低成交量" step={1000000} value={minVolume24h} onChange={setMinVolume24h} />
        <SelectFilter label="排序" value={sortBy} onChange={(value) => updateSort(value as UnifiedOpportunitySortBy)}>
          {SORT_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </SelectFilter>
        <div className="flex flex-col justify-end gap-2 text-sm text-slate-200">
          <label className="flex items-center gap-2">
            <input checked={recommendedOnly} className="h-4 w-4 accent-cyan-400" type="checkbox" onChange={(event) => setRecommendedOnly(event.target.checked)} />
            <span>只看推荐</span>
          </label>
          <label className="flex items-center gap-2">
            <input checked={hideHighRisk} className="h-4 w-4 accent-cyan-400" type="checkbox" onChange={(event) => setHideHighRisk(event.target.checked)} />
            <span>隐藏高风险</span>
          </label>
        </div>
      </FilterPanel>

      {errors.length > 0 || stale ? (
        <p className="border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          {errors.length > 0 ? "部分交易所数据获取失败，当前展示可用数据。" : null}
          {stale ? " 当前为缓存数据。" : null}
        </p>
      ) : null}

      <DataTableShell>
        <table className="min-w-[1680px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-950 text-xs uppercase tracking-wide text-slate-500">
            <tr className="border-b border-slate-800">
              <SortableTh align="right" current={{ sort: sortBy, order: sortOrder }} sort="score" onSort={updateSort}>评分</SortableTh>
              <Th align="right">Rank</Th>
              <Th>类型</Th>
              <Th>风险</Th>
              <Th>币种</Th>
              <Th>方向</Th>
              <Th>交易所</Th>
              <SortableTh align="right" current={{ sort: sortBy, order: sortOrder }} sort="annualizedRate" onSort={updateSort}>年化</SortableTh>
              <SortableTh align="right" current={{ sort: sortBy, order: sortOrder }} sort="exchangeCoverage" onSort={updateSort}>覆盖交易所</SortableTh>
              <Th align="right">价差 / Basis</Th>
              <SortableTh align="right" current={{ sort: sortBy, order: sortOrder }} sort="estimatedCarryAnnualized" onSort={updateSort}>估算Carry</SortableTh>
              <SortableTh align="right" current={{ sort: sortBy, order: sortOrder }} sort="volume24h" onSort={updateSort}>24h成交量</SortableTh>
              <Th align="right">持仓量</Th>
              <SortableTh current={{ sort: sortBy, order: sortOrder }} sort="nextFundingTime" onSort={updateSort}>下次资金费率</SortableTh>
              <Th>原因</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading && rows.length === 0 ? (
              <SkeletonRows colSpan={15} rowCount={5} />
            ) : null}
            {filteredRows.map((row) => (
              <tr className="bg-slate-950/20 hover:bg-slate-900/70" key={row.id}>
                <Td align="right">
                  <ScoreBadge score={row.score} />
                </Td>
                <Td align="right">
                  <RankingTierBadge tier={rankedMap.get(row.id) ?? "weak"} />
                </Td>
                <Td>
                  <TypeBadge label={row.opportunityType} />
                </Td>
                <Td>
                  <RiskTags tags={row.riskTags} />
                </Td>
                <Td>
                  <div className="font-semibold text-slate-100">{row.symbol}</div>
                  <div className="text-xs text-slate-500">
                    {row.base}/{row.quote}
                  </div>
                </Td>
                <Td>
                  <span className="line-clamp-2 max-w-[240px] text-slate-300" title={row.direction}>{row.direction}</span>
                </Td>
                <Td>
                  <ExchangePair row={row} />
                </Td>
                <Td align="right">
                  <span className={row.annualizedRate >= 90 ? "text-orange-300" : "text-emerald-300"}>{formatPercent(row.annualizedRate)}%</span>
                </Td>
                <Td align="right">
                  <span title={getExchangeCoverageTitle(getOpportunityExchanges(row))}>{formatExchangeCoverage(getOpportunityExchanges(row))}</span>
                </Td>
                <Td align="right">
                  <span className={Math.abs(row.basisPercent ?? row.spreadPercent ?? 0) >= 1 ? "text-orange-300" : "text-slate-200"}>{formatSpreadBasis(row)}</span>
                </Td>
                <Td align="right">{row.estimatedCarryAnnualized === undefined ? "-" : `${formatPercent(row.estimatedCarryAnnualized)}%`}</Td>
                <Td align="right">{formatCompactUsd(row.volume24h)}</Td>
                <Td align="right">{formatCompactUsd(row.openInterestUsd)}</Td>
                <Td>{formatTime(row.nextFundingTime ?? null)}</Td>
                <Td>
                  <span className="line-clamp-2 max-w-[420px] text-slate-400" title={row.opportunityReason}>
                    {row.opportunityReason}
                  </span>
                </Td>
              </tr>
            ))}
            {!loading && filteredRows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={15}>
                  暂无符合条件的机会。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </DataTableShell>
      </ErrorBoundary>
    </PageShell>
  );
}

function buildStats(rows: UnifiedOpportunity[]) {
  return {
    total: rows.length,
    recommended: rows.filter(isRecommendedUnifiedOpportunity).length,
    highestScore: Math.max(0, ...rows.map((row) => row.score)),
    highestAnnualized: Math.max(0, ...rows.map((row) => row.annualizedRate)),
    highRisk: rows.filter(isHighRiskUnifiedOpportunity).length
  };
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
      <input
        className="h-9 w-full border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
        min={0}
        step={step}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
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
  current: { sort: UnifiedOpportunitySortBy; order: SortOrder };
  onSort: (sort: UnifiedOpportunitySortBy) => void;
  sort: UnifiedOpportunitySortBy;
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

function TypeBadge({ label }: { label: UnifiedOpportunityType }) {
  const tone = {
    CrossExchange: "border-purple-400/50 bg-purple-400/10 text-purple-200",
    SpotPerp: "border-cyan-400/50 bg-cyan-400/10 text-cyan-200",
    Basis: "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
  }[label];

  return <span className={`border px-2 py-0.5 text-xs ${tone}`}>{formatType(label)}</span>;
}

function RiskTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return <span className="text-slate-500">-</span>;
  }

  return (
    <div className="flex max-w-[220px] flex-wrap gap-1">
      {tags.slice(0, 3).map((tag) => (
        <RiskBadge key={tag} label={tag} />
      ))}
    </div>
  );
}

function ExchangePair({ row }: { row: UnifiedOpportunity }) {
  return (
    <div className="flex max-w-[220px] flex-wrap gap-1">
      <ExchangeBadge label={row.primaryExchange} />
      {row.secondaryExchange ? <ExchangeBadge label={row.secondaryExchange} /> : null}
    </div>
  );
}

function getOpportunityExchanges(row: UnifiedOpportunity): string[] {
  return Array.from(new Set([row.primaryExchange, row.secondaryExchange].flatMap((exchange) => (exchange ? [exchange] : []))));
}

function formatType(value: "all" | UnifiedOpportunityType) {
  if (value === "all") return "全部";
  if (value === "CrossExchange") return "跨交易所费率差";
  if (value === "SpotPerp") return "现货+永续";
  return "Basis";
}

function formatPercent(value: number) {
  return value.toFixed(2);
}

/** Ranking tier badge component. */
function RankingTierBadge({ tier }: { tier: OpportunityRankingTier }) {
  const colors: Record<OpportunityRankingTier, string> = {
    elite: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    strong: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    medium: "border-blue-500/40 bg-blue-500/10 text-blue-300",
    weak: "border-slate-600/40 bg-slate-700/30 text-slate-400",
  };
  const labels: Record<OpportunityRankingTier, string> = {
    elite: "Elite",
    strong: "Strong",
    medium: "Medium",
    weak: "Weak",
  };
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${colors[tier]}`}>
      {labels[tier]}
    </span>
  );
}

function formatSpreadBasis(row: UnifiedOpportunity) {
  if (row.basisPercent !== undefined) return `${formatPercent(row.basisPercent)}%`;
  if (row.spreadPercent !== undefined) return `${formatPercent(row.spreadPercent)}%`;
  return "-";
}

function formatCompactUsd(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "-";
  return Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 1, notation: "compact", style: "currency" }).format(value);
}

function formatTime(value: number | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}
