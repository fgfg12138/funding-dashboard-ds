import { NextRequest, NextResponse } from "next/server";
import { queryAllFundingHistory } from "@/lib/data/historyStore";
import { buildFundingHeatmap } from "@/lib/research/fundingHeatmap";
import type { ExchangeName } from "@/lib/exchanges/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const windowHours = parseWindowHours(request.nextUrl.searchParams.get("window"));
  const minSnapshotCount = parseNumberParam(request.nextUrl.searchParams.get("minSnapshotCount")) ?? 1;
  const limit = parseNumberParam(request.nextUrl.searchParams.get("limit")) ?? 20;
  const exchange = parseExchange(request.nextUrl.searchParams.get("exchange"));
  const now = Date.now();
  const rows = await queryAllFundingHistory({
    from: now - windowHours * 60 * 60_000,
    to: now,
    limit: 5000
  });

  return NextResponse.json({
    data: buildFundingHeatmap(rows, { now, windowHours, exchange, minSnapshotCount, limit }),
    errors: [],
    updatedAt: now,
    stale: false
  });
}

function parseWindowHours(value: string | null): number {
  if (value === "1" || value === "1h") return 1;
  if (value === "7d" || value === "168") return 168;
  if (value === "30d" || value === "720") return 720;
  return 24;
}

function parseExchange(value: string | null): "all" | ExchangeName {
  if (value === "Binance" || value === "OKX" || value === "Bybit") {
    return value;
  }

  return "all";
}

function parseNumberParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
