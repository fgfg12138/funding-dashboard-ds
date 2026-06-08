import { NextRequest, NextResponse } from "next/server";
import { queryAllFundingHistory, queryAllOpportunityHistory } from "../../../../../lib/data/historyStore";
import { buildAlphaDrilldown } from "../../../../../lib/research/alphaDrilldown";
import { parseAlphaWindowHours } from "../../../../../lib/research/alphaScore";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const windowHours = parseAlphaWindowHours(request.nextUrl.searchParams.get("window"));
  const now = Date.now();
  const from = now - windowHours * 60 * 60_000;
  const [opportunityRows, fundingRows] = await Promise.all([
    queryAllOpportunityHistory({ from, to: now, limit: 5000 }),
    queryAllFundingHistory({ from, to: now, limit: 5000 })
  ]);
  const data = buildAlphaDrilldown({
    id: decodeURIComponent(id),
    opportunityRows,
    fundingRows,
    now,
    windowHours,
    compareSymbols: parseCompareSymbols(request.nextUrl.searchParams.get("compare"))
  });

  return NextResponse.json({
    data,
    errors: [],
    updatedAt: now,
    stale: false
  });
}

function parseCompareSymbols(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const symbols = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return symbols.length ? symbols : undefined;
}
