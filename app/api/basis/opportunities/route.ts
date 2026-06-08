import { NextResponse } from "next/server";
import { getBasisOpportunitiesResponse } from "../../../../lib/basis/basisApi";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getBasisOpportunitiesResponse());
}
