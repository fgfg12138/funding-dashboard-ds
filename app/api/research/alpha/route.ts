import { NextRequest, NextResponse } from "next/server";
import { queryAllFundingHistory, queryAllOpportunityHistory } from "../../../../lib/data/historyStore";
import { buildAlphaApiPayload, parseAlphaWindowHours } from "../../../../lib/research/alphaScore";
import { buildFundingFactorResearch } from "../../../../lib/research/fundingFactors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const windowHours = parseAlphaWindowHours(request.nextUrl.searchParams.get("window"));
  const now = Date.now();
  const samples = await loadFundingFactorSamples({
    now,
    windowHours
  });

  return NextResponse.json({
    data: buildAlphaApiPayload(samples, request.nextUrl.searchParams),
    errors: [],
    updatedAt: now,
    stale: false,
    sourceStatus: {}
  });
}

async function loadFundingFactorSamples({ now, windowHours }: { now: number; windowHours: number }) {
  const from = now - windowHours * 60 * 60_000;
  const [opportunityRows, fundingRows] = await Promise.all([
    queryAllOpportunityHistory({ from, to: now, limit: 5000 }),
    queryAllFundingHistory({ from, to: now, limit: 5000 })
  ]);

  return buildFundingFactorResearch({ opportunityRows, fundingRows, now, windowHours }).samples;
}
