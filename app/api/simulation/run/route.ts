import { NextRequest, NextResponse } from "next/server";
import { runSimulation } from "../../../../lib/simulation/simService";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const result = await runSimulation({
    window: request.nextUrl.searchParams.get("window"),
    config: {
      maxPositionFraction: parseNumberParam(request.nextUrl.searchParams.get("maxPositionFraction")),
      minOpenAlphaScore: parseNumberParam(request.nextUrl.searchParams.get("minOpenAlphaScore")),
      closeAlphaScoreThreshold: parseNumberParam(request.nextUrl.searchParams.get("closeAlphaScoreThreshold"))
    }
  });

  return NextResponse.json({
    data: result,
    updatedAt: result.snapshot.timestamp
  });
}

function parseNumberParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
