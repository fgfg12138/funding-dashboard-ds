import { NextResponse } from "next/server";
import { buildCrossExchangeOpportunities, getFundingSnapshot } from "@/lib/data/fundingService";

export async function GET() {
  const snapshot = await getFundingSnapshot();

  return NextResponse.json({
    data: buildCrossExchangeOpportunities(snapshot.fundingMarkets),
    errors: snapshot.errors,
    updatedAt: snapshot.updatedAt,
    stale: snapshot.stale,
    sourceStatus: snapshot.sourceStatus
  });
}
