import { NextResponse } from "next/server";
import { buildSpotPerpOpportunities, getFundingSnapshot } from "@/lib/data/fundingService";

export async function GET() {
  const snapshot = await getFundingSnapshot();

  return NextResponse.json({
    data: buildSpotPerpOpportunities(snapshot.spotMarkets, snapshot.fundingMarkets),
    errors: snapshot.errors,
    updatedAt: snapshot.updatedAt,
    stale: snapshot.stale,
    sourceStatus: snapshot.sourceStatus
  });
}
