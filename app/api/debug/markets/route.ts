import { NextResponse } from "next/server";
import { buildDebugMarketRows, getFundingSnapshot } from "@/lib/data/fundingService";

export async function GET() {
  const snapshot = await getFundingSnapshot();

  return NextResponse.json({
    data: buildDebugMarketRows(snapshot.fundingMarkets),
    errors: snapshot.errors,
    updatedAt: snapshot.updatedAt,
    stale: snapshot.stale,
    sourceStatus: snapshot.sourceStatus
  });
}
