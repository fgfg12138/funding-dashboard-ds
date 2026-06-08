import { NextRequest, NextResponse } from "next/server";
import { getAdlSettingsResponse, patchAdlSettingsResponse } from "../../../lib/adl/adlApi";

export const runtime = "nodejs";

export async function GET() {
  const response = await getAdlSettingsResponse();
  return NextResponse.json(response, { status: response.status });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const response = await patchAdlSettingsResponse(body);
  return NextResponse.json(response, { status: response.status });
}
