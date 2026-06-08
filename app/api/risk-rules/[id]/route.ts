import { NextRequest, NextResponse } from "next/server";
import { deleteRiskRuleResponse, patchRiskRuleResponse } from "../../../../lib/riskRules/riskRuleApi";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const response = await patchRiskRuleResponse(id, body);
  return NextResponse.json(response, { status: response.status });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const response = await deleteRiskRuleResponse(id);
  return NextResponse.json(response, { status: response.status });
}
