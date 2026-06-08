import { NextRequest, NextResponse } from "next/server";
import { createStrategyResponse, getStrategiesResponse } from "../../../lib/strategies/strategyApi";

export const runtime = "nodejs";

export async function GET() {
  const response = await getStrategiesResponse();
  return NextResponse.json(response, { status: response.status });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const response = await createStrategyResponse(body);
  return NextResponse.json(response, { status: response.status });
}
