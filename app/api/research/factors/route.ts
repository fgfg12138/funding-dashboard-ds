import { NextRequest, NextResponse } from "next/server";
import { queryAllFundingHistory, queryAllOpportunityHistory } from "@/lib/data/historyStore";
import { buildFundingFactorResearch } from "@/lib/research/fundingFactors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const windowHours = parseWindowHours(request.nextUrl.searchParams.get("window"));
  const now = Date.now();
  const from = now - windowHours * 60 * 60_000;
  const [opportunityRows, fundingRows] = await Promise.all([
    queryAllOpportunityHistory({ from, to: now, limit: 5000 }),
    queryAllFundingHistory({ from, to: now, limit: 5000 })
  ]);

  return NextResponse.json({
    data: buildFundingFactorResearch({ opportunityRows, fundingRows, now, windowHours }),
    errors: [],
    updatedAt: now,
    stale: false,
    sourceStatus: {}
  });
}

function parseWindowHours(value: string | null): number {
  if (value === "1" || value === "1h") return 1;
  if (value === "7d" || value === "168") return 168;
  if (value === "30d" || value === "720") return 720;
  return 24;
}
