import { NextRequest, NextResponse } from "next/server";
import { getFundingSnapshot } from "@/lib/data/fundingService";
import { buildExchangeCompareRows } from "@/lib/debug/exchangeCompare";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol") ?? "BTC/USDT";
  const snapshot = await getFundingSnapshot();
  const now = Date.now();

  return NextResponse.json({
    data: buildExchangeCompareRows({
      fundingMarkets: snapshot.fundingMarkets,
      spotMarkets: snapshot.spotMarkets,
      symbol,
      now
    }),
    errors: snapshot.errors,
    updatedAt: snapshot.updatedAt,
    stale: snapshot.stale,
    sourceStatus: snapshot.sourceStatus,
    symbol
  });
}
