import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { queryAllFundingHistory } from "@/lib/data/historyStore";
import { buildFundingHeatmap, type FundingHeatmapRow } from "@/lib/research/fundingHeatmap";
import type { ExchangeName } from "@/lib/exchanges/types";

export const metadata: Metadata = {
  title: "Funding热力图 — 资金费率套利看板",
  description: "只读 historical funding aggregation by exchange and symbol."
};

export const dynamic = "force-dynamic";

const WINDOW_OPTIONS = [
  { label: "1h", hours: 1 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 }
];
const EXCHANGES: Array<"all" | ExchangeName> = ["all", "Binance", "OKX", "Bybit"];

export default async function HeatmapPage({
  searchParams
}: {
  searchParams: Promise<{ window?: string; exchange?: string; minSnapshotCount?: string }>;
}) {
  const params = await searchParams;
  const windowHours = parseWindowHours(params.window);
  const exchange = parseExchange(params.exchange);
  const minSnapshotCount = parsePositiveInt(params.minSnapshotCount) ?? 1;
  const now = Date.now();
  const rows = await queryAllFundingHistory({
    from: now - windowHours * 60 * 60_000,
    to: now,
    limit: 5000
  });
  const heatmap = buildFundingHeatmap(rows, { now, windowHours, exchange, minSnapshotCount, limit: 20 });

  return (
    <PageShell
      activeHref="/heatmap"
      description="只读 historical funding aggregation by exchange and symbol."
      eyebrow="Funding Heatmap"
      refreshHref={buildHeatmapHref(params, {})}
      showRefresh={false}
      title="Funding Heatmap"
      updatedAt={heatmap.generatedAt}
    >
      <section className="flex flex-col gap-3 border-y border-slate-800 bg-slate-950/40 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex w-fit rounded border border-slate-700 bg-slate-950 p-1">
            {WINDOW_OPTIONS.map((item) => (
              <Link
                className={`h-8 px-3 py-1.5 text-sm ${windowHours === item.hours ? "bg-cyan-400/20 text-cyan-100" : "text-slate-400 hover:text-slate-100"}`}
                href={buildHeatmapHref(params, { window: item.label })}
                key={item.label}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <form action="/heatmap" className="flex flex-wrap items-end gap-3">
            <input name="window" type="hidden" value={formatWindowParam(windowHours)} />
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Exchange</span>
              <select
                className="h-10 rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
                defaultValue={exchange}
                name="exchange"
              >
                {EXCHANGES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Min snapshots</span>
              <input
                className="h-10 w-28 rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
                defaultValue={String(minSnapshotCount)}
                min="1"
                name="minSnapshotCount"
                type="number"
              />
            </label>
            <button className="h-10 rounded border border-cyan-400/50 bg-cyan-400/10 px-3 text-sm text-cyan-100 hover:bg-cyan-400/20" type="submit">
              Apply
            </button>
          </form>
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            <span>{heatmap.rows.length} heatmap cells</span>
            <span>{rows.length} funding snapshots</span>
            <span>更新时间 {new Date(heatmap.generatedAt).toLocaleTimeString()}</span>
          </div>
        </section>

        <section className="space-y-4">
          {EXCHANGES.filter((item): item is ExchangeName => item !== "all")
            .filter((item) => exchange === "all" || exchange === item)
            .map((item) => (
              <ExchangeHeatmap exchange={item} key={item} rows={heatmap.groupedByExchange[item]} />
            ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-4">
          <FundingTable rows={heatmap.topPositive} title="Top Positive Funding" />
          <FundingTable rows={heatmap.topNegative} title="Top Negative Funding" />
          <FundingTable rows={heatmap.mostVolatile} title="Most Volatile Funding" />
          <FundingTable rows={heatmap.persistentPositive} title="Persistent Positive Funding" />
        </section>
    </PageShell>
  );
}

function ExchangeHeatmap({ exchange, rows }: { exchange: ExchangeName; rows: FundingHeatmapRow[] }) {
  return (
    <section className="rounded border border-slate-800 bg-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-white">{exchange}</h2>
        <span className="text-xs text-slate-500">{rows.length} symbols</span>
      </div>
      {rows.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-8">
          {rows.map((row) => (
            <div className={`rounded border p-2 ${getHeatCellClass(row.latestAnnualized)}`} key={`${row.exchange}:${row.symbol}`}>
              <div className="truncate text-xs font-semibold text-white">{row.symbol}</div>
              <div className="mt-1 text-sm font-semibold">{formatPercent(row.latestAnnualized)}</div>
              <div className="mt-1 text-[11px] opacity-80">{row.snapshotCount} snaps</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded border border-slate-800 bg-slate-950 px-3 py-8 text-center text-sm text-slate-500">
          No funding history for this exchange in the selected window.
        </div>
      )}
    </section>
  );
}

function FundingTable({ rows, title }: { rows: FundingHeatmapRow[]; title: string }) {
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
              <Header>Exchange</Header>
              <Header>最新年化</Header>
              <Header>Avg</Header>
              <Header>波动率</Header>
              <Header>Positive</Header>
              <Header>Snapshots</Header>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-b border-slate-800/70 hover:bg-slate-800/40" key={`${title}:${row.exchange}:${row.symbol}`}>
                <Cell>{row.symbol}</Cell>
                <Cell>{row.exchange}</Cell>
                <Cell>
                  <SignedPercent value={row.latestAnnualized} />
                </Cell>
                <Cell>{formatPercent(row.avgAnnualized)}</Cell>
                <Cell>{formatPercent(row.volatility)}</Cell>
                <Cell>{formatRatio(row.positiveFundingRatio)}</Cell>
                <Cell>{row.snapshotCount}</Cell>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-8 text-center text-slate-500" colSpan={7}>
                  No rows for this list.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap border-b border-slate-800 px-3 py-2 font-medium">{children}</th>;
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="whitespace-nowrap px-3 py-2 text-slate-200">{children}</td>;
}

function SignedPercent({ value }: { value: number }) {
  const color = value >= 0 ? "text-emerald-300" : "text-rose-300";
  return <span className={color}>{formatPercent(value)}</span>;
}

function getHeatCellClass(value: number) {
  if (value >= 100) return "border-orange-300/50 bg-orange-400/25 text-orange-100";
  if (value >= 30) return "border-emerald-300/50 bg-emerald-400/20 text-emerald-100";
  if (value >= 0) return "border-cyan-300/40 bg-cyan-400/10 text-cyan-100";
  if (value <= -30) return "border-rose-300/50 bg-rose-400/25 text-rose-100";
  return "border-slate-700 bg-slate-900 text-slate-200";
}

function formatPercent(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function formatRatio(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

function parseWindowHours(value?: string): number {
  if (value === "1" || value === "1h") return 1;
  if (value === "7d" || value === "168") return 168;
  if (value === "30d" || value === "720") return 720;
  return 24;
}

function formatWindowParam(hours: number) {
  if (hours === 1) return "1h";
  if (hours === 168) return "7d";
  if (hours === 720) return "30d";
  return "24h";
}

function parseExchange(value?: string): "all" | ExchangeName {
  if (value === "Binance" || value === "OKX" || value === "Bybit") return value;
  return "all";
}

function parsePositiveInt(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function buildHeatmapHref(params: Record<string, string | undefined>, overrides: Record<string, string | undefined>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...overrides })) {
    if (value !== undefined && value !== "") next.set(key, value);
  }
  return `/heatmap?${next.toString()}`;
}
