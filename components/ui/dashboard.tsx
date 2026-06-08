import Link from "next/link";
import type { ReactNode } from "react";

export type NavItem = {
  href: string;
  label: string;
};

export const APP_NAV_ITEMS: NavItem[] = [
  { href: "/opportunities", label: "机会总览" },
  { href: "/dashboard", label: "资金费率看板" },
  { href: "/basis", label: "基差看板" },
  { href: "/alpha", label: "Alpha发现" },
  { href: "/factors", label: "因子研究" },
  { href: "/heatmap", label: "Funding热力图" },
  { href: "/research", label: "机会验证" },
  { href: "/notifications", label: "通知中心" },
  { href: "/simulation", label: "模拟回测" },
  { href: "/strategies", label: "策略管理" },
  { href: "/risk-rules", label: "风险规则" },
  { href: "/adl-monitor", label: "ADL监控" },
  { href: "/execution", label: "执行中心" },
  { href: "/paper-portfolio", label: "模拟资产" },
  { href: "/api-keys", label: "API管理" },
  { href: "/account-sync", label: "账户同步" },
  { href: "/audit", label: "审计日志" },
  { href: "/execution-queue", label: "执行队列" },
  { href: "/safety", label: "安全控制" },
  { href: "/notifications-center", label: "本地通知" },
  { href: "/sandbox-lifecycle", label: "沙盒生命周期" },
  { href: "/testnet-readiness", label: "Testnet Readiness" },
  { href: "/risk-center", label: "风险中心" },
];

export function AppShell({
  actions,
  activeHref,
  children,
  eyebrow,
  navItems = APP_NAV_ITEMS,
  subtitle,
  title
}: {
  actions?: ReactNode;
  activeHref?: string;
  children: ReactNode;
  eyebrow?: string;
  navItems?: NavItem[];
  subtitle: string;
  title: string;
}) {
  return (
    <main className="min-h-screen bg-[#060914] px-3 py-4 text-slate-100 sm:px-5 lg:px-6">
      <div className="mx-auto max-w-[1920px] space-y-4">
        <header className="border border-slate-800 bg-slate-950/70">
          <div className="flex flex-col gap-4 border-b border-slate-800 px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              {eyebrow ? <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">{eyebrow}</p> : null}
              <h1 className="mt-1 text-2xl font-semibold text-white">{title}</h1>
              <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
          <TopNav activeHref={activeHref} items={navItems} />
        </header>
        {children}
      </div>
    </main>
  );
}

export function TopNav({ activeHref, items = APP_NAV_ITEMS }: { activeHref?: string; items?: NavItem[] }) {
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 py-2 text-xs">
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            className={`whitespace-nowrap border px-3 py-1.5 ${
              active
                ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                : "border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-900 hover:text-slate-100"
            }`}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function StatCard({
  label,
  tone = "slate",
  value
}: {
  label: string;
  tone?: "slate" | "cyan" | "green" | "yellow" | "orange" | "red";
  value: string;
}) {
  const toneClass = {
    slate: "text-slate-100",
    cyan: "text-cyan-300",
    green: "text-emerald-300",
    yellow: "text-yellow-200",
    orange: "text-orange-300",
    red: "text-red-300"
  }[tone];

  return (
    <div className="border border-slate-800 bg-slate-950/60 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

export function FilterPanel({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="border border-slate-800 bg-slate-950/50 p-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_150px_140px_130px_150px_160px_150px_170px]">
        {children}
      </div>
      {footer ? <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">{footer}</div> : null}
    </section>
  );
}

export function DataTableShell({ children }: { children: ReactNode }) {
  return <section className="max-h-[520px] overflow-auto border border-slate-800 bg-slate-950/30">{children}</section>;
}

export function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 75
      ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200"
      : score >= 60
        ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-200"
        : score >= 40
          ? "border-yellow-400/50 bg-yellow-400/15 text-yellow-100"
          : "border-slate-700 bg-slate-900 text-slate-300";

  return <span className={`inline-flex min-w-11 justify-center border px-2 py-1 text-xs font-semibold tabular-nums ${tone}`}>{score}</span>;
}

export function RiskBadge({ label }: { label: string }) {
  return <span className="border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-200">{label}</span>;
}

export function ExchangeBadge({ label }: { label: string }) {
  return <span className="border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-200">{label}</span>;
}

export function TypeBadge({ label }: { label: "CrossExchange" | "SpotPerp" | "Basis" }) {
  const tone = {
    CrossExchange: "border-purple-400/50 bg-purple-400/10 text-purple-200",
    SpotPerp: "border-cyan-400/50 bg-cyan-400/10 text-cyan-200",
    Basis: "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
  }[label];
  const text = label === "CrossExchange" ? "跨交易所费率差" : label === "SpotPerp" ? "现货+永续" : "Basis";

  return <span className={`border px-2 py-0.5 text-xs ${tone}`}>{text}</span>;
}

export function ReadOnlyPill() {
  return <span className="border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200">只读 / 不交易</span>;
}

/* ── Skeleton ─────────────────────────────────────────── */

/** A pulsing placeholder rectangle.  Use `className` for width/height/rounded. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-800 ${className ?? ""}`} />;
}

/** A set of pulsing skeleton rows for a table, visible while data is loading. */
export function SkeletonRows({ colSpan = 6, rowCount = 5 }: { colSpan?: number; rowCount?: number }) {
  return (
    <>
      {Array.from({ length: rowCount }).map((_, i) => (
        <tr className="border-b border-slate-800" key={i}>
          {Array.from({ length: colSpan }).map((_, j) => (
            <td className="px-3 py-3" key={j}>
              <Skeleton className="h-4 w-full max-w-[120px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** A set of skeleton stat cards while summary data is still loading. */
export function SkeletonStatCards({ count = 5 }: { count?: number }) {
  return (
    <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div className="border border-slate-800 bg-slate-950/60 px-4 py-3" key={i}>
          <Skeleton className="mb-2 h-3 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </section>
  );
}
