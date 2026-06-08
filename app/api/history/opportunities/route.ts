import { NextRequest, NextResponse } from "next/server";
import { queryOpportunityHistory } from "@/lib/data/historyStore";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json(
      {
        data: [],
        error: "symbol is required",
        updatedAt: Date.now()
      },
      { status: 400 }
    );
  }

  const data = await queryOpportunityHistory(symbol, {
    limit: parseNumberParam(request.nextUrl.searchParams.get("limit")),
    from: parseNumberParam(request.nextUrl.searchParams.get("from")),
    to: parseNumberParam(request.nextUrl.searchParams.get("to"))
  });
  return NextResponse.json({
    data,
    updatedAt: Date.now()
  });
}

function parseNumberParam(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
