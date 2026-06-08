import { NextResponse } from "next/server";
import { buildDashboardSummary, getFundingSnapshot } from "@/lib/data/fundingService";

export async function GET() {
  const snapshot = await getFundingSnapshot();

  return NextResponse.json({
    data: buildDashboardSummary(snapshot.fundingMarkets),
    errors: snapshot.errors,
    updatedAt: snapshot.updatedAt,
    stale: snapshot.stale,
    sourceStatus: snapshot.sourceStatus
  });
}
