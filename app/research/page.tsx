import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { queryAllOpportunityHistory } from "@/lib/data/historyStore";
import {
  buildOpportunityResearch,
  type OpportunityResearchFilters,
  type OpportunityResearchResult
} from "@/lib/research/opportunityValidation";

export const metadata: Metadata = {
  title: "机会验证 — 资金费率套利看板",
  description: "只读 historical validation for funding opportunities. 不交易, 无 API Key."
};

export const dynamic = "force-dynamic";

const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_LIMIT = 12;

export default async function ResearchPage({
  searchParams
}: {
  searchParams: Promise<{
    window?: string;
    limit?: string;
    minLatestAnnualized?: string;
    minSurvivalHours?: string;
    maxAnnualizedDecay?: string;
    maxAbsPriceSpreadChange?: string;
    type?: string;
  }>;
}) {
  const params = await searchParams;
  const windowHours = parseWindowHours(params.window);
  const limit = parsePositiveInt(params.limit) ?? DEFAULT_LIMIT;
  const filters = parseFilters(params);
  const now = Date.now();
  const rows = await queryAllOpportunityHistory({
    from: now - windowHours * 60 * 60_000,
    to: now,
    limit: 5000
  });
  const research = buildOpportunityResearch(rows, { now, windowHours, limit, filters });

  return (
    <PageShell
      activeHref="/research"
      description="只读 historical validation for funding opportunities. 不交易, 无 API Key."
      eyebrow="Opportunity Validation Engine"
      refreshHref={buildResearchHref(params, {})}
      showRefresh={false}
      title="Research"
      updatedAt={research.generatedAt}
    >
      <section className="flex flex-col gap-3 border-y border-slate-800 bg-slate-950/40 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex w-fit rounded border border-slate-700 bg-slate-950 p-1">
            {[1, 4, 8, 24].map((hours) => (
              <Link
                className={`h-8 px-3 py-1.5 text-sm ${windowHours === hours ? "bg-cyan-400/20 text-cyan-100" : "text-slate-400 hover:text-slate-100"}`}
                href={buildResearchHref(params, { window: `${hours}h`, limit: String(limit) })}
                key={hours}
              >
                {hours}h
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            <span>{rows.length} snapshots</span>
            <span>Window {research.windowHours}h</span>
            <span>更新时间 {new Date(research.generatedAt).toLocaleTimeString()}</span>
          </div>
        </section>

        <form className="grid gap-3 border-b border-slate-800 pb-4 lg:grid-cols-6" action="/research">
          <input name="window" type="hidden" value={`${windowHours}h`} />
          <FilterInput defaultValue={params.minLatestAnnualized ?? "30"} label="最低最新年化" name="minLatestAnnualized" />
          <FilterInput defaultValue={params.minSurvivalHours ?? "4"} label="最低存活小时" name="minSurvivalHours" />
          <FilterInput defaultValue={params.maxAnnualizedDecay ?? "30"} label="最大年化衰减" name="maxAnnualizedDecay" />
          <FilterInput defaultValue={params.maxAbsPriceSpreadChange ?? ""} label="Max abs spread change" name="maxAbsPriceSpreadChange" />
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">Type</span>
            <select
              className="h-10 w-full rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
              defaultValue={filters.type ?? "all"}
              name="type"
            >
              <option value="all">all</option>
              <option value="cross-exchange">cross-exchange</option>
              <option value="spot-perp">spot-perp</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">Limit</span>
            <div className="flex gap-2">
              <input
                className="h-10 min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
                defaultValue={String(limit)}
                min="1"
                name="limit"
                type="number"
              />
              <button className="h-10 rounded border border-cyan-400/50 bg-cyan-400/10 px-3 text-sm text-cyan-100 hover:bg-cyan-400/20" type="submit">
                Apply
              </button>
            </div>
          </label>
        </form>

        <section className="grid gap-4 xl:grid-cols-3">
          <ResearchTable rows={research.topStable} title="Top Stable Opportunities" />
          <ResearchTable rows={research.topDecayed} title="衰减最高机会" />
          <ResearchTable rows={research.longestSurvival} title="存活最长机会" />
        </section>
    </PageShell>
  );
}

function ResearchTable({ rows, title }: { rows: OpportunityResearchResult["topStable"]; title: string }) {
  return (
    <section className="rounded border border-slate-800 bg-panel">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <span className="text-xs text-slate-500">{rows.length} rows</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="bg-slate-950 text-slate-400">
            <tr>
              <Header>Symbol</Header>
              <Header>Type</Header>
              <Header>Pair</Header>
              <Header>质量分</Header>
              <Header>存活率</Header>
              <Header>最新年化</Header>
              <Header>衰减率</Header>
              <Header>Spread Change</Header>
              <Header>First seen</Header>
              <Header>最新出现</Header>
              <Header>Snapshots</Header>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-b border-slate-800/70 hover:bg-slate-800/40" key={row.id}>
                <Cell>
                  <div className="font-medium text-slate-100">{row.symbol}</div>
                  <div className="max-w-[180px] truncate text-[11px] text-slate-500" title={row.label}>
                    {row.label}
                  </div>
                </Cell>
                <Cell>{row.type}</Cell>
                <Cell>{row.exchangePair}</Cell>
                <Cell>
                  <Score value={row.qualityScore} />
                </Cell>
                <Cell>{formatHours(row.survivalHours)}</Cell>
                <Cell>{formatPercent(row.latestAnnualized)}</Cell>
                <Cell>
                  <SignedPercent value={row.annualizedDecay} />
                </Cell>
                <Cell>
                  <SignedPercent value={row.priceSpreadChange} />
                </Cell>
                <Cell>{formatTime(row.firstTimestamp)}</Cell>
                <Cell>{formatTime(row.latestTimestamp)}</Cell>
                <Cell>{row.snapshotCount}</Cell>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-8 text-center text-slate-500" colSpan={11}>
                  No research rows yet. Let the dashboard collect more opportunity snapshots.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FilterInput({ defaultValue, label, name }: { defaultValue: string; label: string; name: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <input
        className="h-10 w-full rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
        defaultValue={defaultValue}
        name={name}
        step="0.01"
        type="number"
      />
    </label>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap border-b border-slate-800 px-3 py-2 font-medium">{children}</th>;
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="whitespace-nowrap px-3 py-2 text-slate-200">{children}</td>;
}

function Score({ value }: { value: number }) {
  const color = value >= 75 ? "text-emerald-300" : value >= 50 ? "text-orange-300" : "text-rose-300";
  return <span className={`font-semibold ${color}`}>{value}</span>;
}

function SignedPercent({ value }: { value: number }) {
  const color = value <= 0 ? "text-emerald-300" : "text-rose-300";
  return <span className={color}>{formatPercent(value)}</span>;
}

function formatPercent(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function formatHours(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}h`;
}

function formatTime(value: number) {
  return new Date(value).toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function parseWindowHours(value?: string): 1 | 4 | 8 | 24 {
  if (value === "1" || value === "1h") return 1;
  if (value === "4" || value === "4h") return 4;
  if (value === "8" || value === "8h") return 8;
  return DEFAULT_WINDOW_HOURS;
}

function parsePositiveInt(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function parseFilters(params: {
  minLatestAnnualized?: string;
  minSurvivalHours?: string;
  maxAnnualizedDecay?: string;
  maxAbsPriceSpreadChange?: string;
  type?: string;
}): OpportunityResearchFilters {
  return {
    minLatestAnnualized: parseNumber(params.minLatestAnnualized),
    minSurvivalHours: parseNumber(params.minSurvivalHours),
    maxAnnualizedDecay: parseNumber(params.maxAnnualizedDecay),
    maxAbsPriceSpreadChange: parseNumber(params.maxAbsPriceSpreadChange),
    type: parseType(params.type)
  };
}

function parseNumber(value?: string): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseType(value?: string): OpportunityResearchFilters["type"] {
  if (value === "cross-exchange" || value === "spot-perp") return value;
  return "all";
}

function buildResearchHref(
  params: Record<string, string | undefined>,
  overrides: Record<string, string | undefined>
) {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries({ ...params, ...overrides })) {
    if (value !== undefined && value !== "") {
      next.set(key, value);
    }
  }

  return `/research?${next.toString()}`;
}
