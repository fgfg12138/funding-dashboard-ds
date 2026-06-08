import { NextRequest, NextResponse } from "next/server";
import { deleteStrategyResponse, patchStrategyResponse } from "../../../../lib/strategies/strategyApi";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const response = await patchStrategyResponse(id, body);
  return NextResponse.json(response, { status: response.status });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const response = await deleteStrategyResponse(id);
  return NextResponse.json(response, { status: response.status });
}
