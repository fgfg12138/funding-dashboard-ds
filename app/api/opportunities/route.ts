import { NextResponse } from "next/server";
import { getUnifiedOpportunitiesResponse } from "../../../lib/opportunities/opportunitiesApi";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getUnifiedOpportunitiesResponse());
}
