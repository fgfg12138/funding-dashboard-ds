import { NextRequest, NextResponse } from "next/server";
import { queryAllOpportunityHistory } from "@/lib/data/historyStore";
import { buildOpportunityResearch, type OpportunityResearchFilters } from "@/lib/research/opportunityValidation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const windowHours = parseWindowHours(request.nextUrl.searchParams.get("window"));
  const limit = parseNumberParam(request.nextUrl.searchParams.get("limit")) ?? 10;
  const now = Date.now();
  const rows = await queryAllOpportunityHistory({
    from: now - windowHours * 60 * 60_000,
    to: now,
    limit: 5000
  });

  return NextResponse.json({
    data: buildOpportunityResearch(rows, {
      now,
      windowHours,
      limit,
      filters: parseFilters(request)
    }),
    errors: [],
    updatedAt: now,
    stale: false
  });
}

function parseFilters(request: NextRequest): OpportunityResearchFilters {
  return {
    minLatestAnnualized: parseNumberParam(request.nextUrl.searchParams.get("minLatestAnnualized")),
    minSurvivalHours: parseNumberParam(request.nextUrl.searchParams.get("minSurvivalHours")),
    maxAnnualizedDecay: parseNumberParam(request.nextUrl.searchParams.get("maxAnnualizedDecay")),
    maxAbsPriceSpreadChange: parseNumberParam(request.nextUrl.searchParams.get("maxAbsPriceSpreadChange")),
    type: parseTypeParam(request.nextUrl.searchParams.get("type"))
  };
}

function parseTypeParam(value: string | null): OpportunityResearchFilters["type"] {
  if (value === "cross-exchange" || value === "spot-perp") {
    return value;
  }

  return "all";
}

function parseWindowHours(value: string | null): 1 | 4 | 8 | 24 {
  if (value === "1" || value === "1h") return 1;
  if (value === "4" || value === "4h") return 4;
  if (value === "8" || value === "8h") return 8;
  return 24;
}

function parseNumberParam(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
