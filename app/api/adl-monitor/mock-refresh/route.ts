import { NextResponse } from "next/server";
import { mockRefreshAdlResponse } from "../../../../lib/adl/adlApi";

export const runtime = "nodejs";

export async function POST() {
  const response = await mockRefreshAdlResponse();
  return NextResponse.json(response, { status: response.status });
}
