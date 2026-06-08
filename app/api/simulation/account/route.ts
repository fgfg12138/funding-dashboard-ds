import { NextResponse } from "next/server";
import { getSimulationAccount } from "../../../../lib/simulation/simService";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    data: await getSimulationAccount(),
    errors: [],
    updatedAt: Date.now(),
    stale: false,
    sourceStatus: {}
  });
}
