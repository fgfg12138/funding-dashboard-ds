import { NextRequest, NextResponse } from "next/server";
import { getSimulationHistory } from "../../../../lib/simulation/simService";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const limit = parseNumberParam(request.nextUrl.searchParams.get("limit")) ?? 500;

  return NextResponse.json({
    data: await getSimulationHistory(limit),
    errors: [],
    updatedAt: Date.now(),
    stale: false,
    sourceStatus: {}
  });
}

function parseNumberParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
