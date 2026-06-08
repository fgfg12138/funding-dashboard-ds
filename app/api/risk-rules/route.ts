import { NextRequest, NextResponse } from "next/server";
import { createRiskRuleResponse, getRiskRulesResponse } from "../../../lib/riskRules/riskRuleApi";

export const runtime = "nodejs";

export async function GET() {
  const response = await getRiskRulesResponse();
  return NextResponse.json(response, { status: response.status });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const response = await createRiskRuleResponse(body);
  return NextResponse.json(response, { status: response.status });
}
