import { NextRequest, NextResponse } from "next/server";
import { evaluateNotificationSignals } from "../../../../lib/notifications/notificationService";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const result = await evaluateNotificationSignals({
    window: request.nextUrl.searchParams.get("window")
  });

  return NextResponse.json({
    data: result.events,
    errors: [],
    evaluatedAt: result.evaluatedAt,
    updatedAt: result.evaluatedAt,
    stale: false,
    sourceStatus: {}
  });
}
