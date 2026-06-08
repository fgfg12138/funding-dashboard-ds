import { NextResponse } from "next/server";
import { getAdlMonitorResponse } from "../../../lib/adl/adlApi";

export const runtime = "nodejs";

export async function GET() {
  const response = await getAdlMonitorResponse();
  return NextResponse.json(response, { status: response.status });
}
