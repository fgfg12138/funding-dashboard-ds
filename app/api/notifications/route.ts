import { NextRequest, NextResponse } from "next/server";
import { queryNotificationEvents } from "../../../lib/notifications/notificationStore";
import type { NotificationEventType, NotificationSeverity } from "../../../lib/notifications/notificationRules";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const limit = parseNumberParam(request.nextUrl.searchParams.get("limit")) ?? 200;
  const severity = parseSeverity(request.nextUrl.searchParams.get("severity"));
  const eventType = parseEventType(request.nextUrl.searchParams.get("eventType"));
  const events = await queryNotificationEvents({ limit: 1000 });
  const filtered = events
    .filter((event) => severity === "all" || event.severity === severity)
    .filter((event) => eventType === "all" || event.eventType === eventType)
    .slice(0, limit);

  return NextResponse.json({
    data: filtered,
    errors: [],
    updatedAt: Date.now(),
    stale: false,
    sourceStatus: {}
  });
}

function parseSeverity(value: string | null): "all" | NotificationSeverity {
  if (value === "info" || value === "success" || value === "warning") {
    return value;
  }

  return "all";
}

function parseEventType(value: string | null): "all" | NotificationEventType {
  if (
    value === "Alpha Signal" ||
    value === "Stable Alpha Signal" ||
    value === "Risky Alpha Warning" ||
    value === "Funding Heat Warning"
  ) {
    return value;
  }

  return "all";
}

function parseNumberParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
