import { NextRequest, NextResponse } from "next/server";
import { cloneStrategyResponse } from "../../../../../lib/strategies/strategyApi";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const response = await cloneStrategyResponse(id);
  return NextResponse.json(response, { status: response.status });
}
