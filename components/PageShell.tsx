"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { TopNav } from "./TopNav";

type PageShellProps = {
  activeHref: string;
  actions?: ReactNode;
  children: ReactNode;
  description: string;
  eyebrow?: string;
  loading?: boolean;
  onRefresh?: () => void;
  refreshHref?: string;
  showRefresh?: boolean;
  title: string;
  updatedAt?: number | null;
};

export function PageShell({
  actions,
  activeHref,
  children,
  description,
  eyebrow = "V1 \u53ea\u8bfb\u770b\u76d8",
  loading = false,
  onRefresh,
  refreshHref,
  showRefresh = true,
  title,
  updatedAt
}: PageShellProps) {
  return (
    <main className="min-h-screen bg-[#060914] px-3 py-3 text-slate-100 sm:px-5 lg:px-6">
      <div className="mx-auto max-w-[1920px] space-y-3">
        <header className="border border-slate-800 bg-slate-950/70">
          <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">{eyebrow}</p>
              <h1 className="mt-1 text-2xl font-semibold text-white">{title}</h1>
              <p className="mt-1 text-sm text-slate-400">{description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-400">{"\u66f4\u65b0\u65f6\u95f4"} <span className="text-slate-100">{formatUpdatedAt(updatedAt)}</span></div>
              {showRefresh ? renderRefresh({ loading, onRefresh, refreshHref }) : null}
              <span className="border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200">{"\u53ea\u8bfb / \u4e0d\u4ea4\u6613"}</span>
              {actions}
            </div>
          </div>
          <TopNav activeHref={activeHref} />
        </header>
        {children}
      </div>
    </main>
  );
}

function renderRefresh({
  loading,
  onRefresh,
  refreshHref
}: {
  loading: boolean;
  onRefresh?: () => void;
  refreshHref?: string;
}) {
  const className =
    "inline-flex h-9 items-center justify-center gap-2 border border-cyan-400/50 bg-cyan-400/10 px-3 text-sm font-medium text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-wait disabled:opacity-60";

  if (onRefresh) {
    return (
      <button className={className} disabled={loading} onClick={onRefresh} title="\u5237\u65b0\u516c\u5f00\u884c\u60c5" type="button">
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{"\u5237\u65b0"}</button>
    );
  }

  return (
    <Link className={className} href={refreshHref ?? "#"} title="\u5237\u65b0\u9875\u9762">
      <RefreshCw className="h-4 w-4" />{"\u5237\u65b0"}</Link>
  );
}

function formatUpdatedAt(value?: number | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}
