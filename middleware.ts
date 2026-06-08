import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Paths that are allowed to accept mutating methods (POST/PUT/PATCH/DELETE).
 * These are local configuration, mock-data, and simulation endpoints
 * that do NOT interact with any exchange API or account.
 */
const ALLOWED_MUTATION_PREFIXES = [
  "/api/adl-monitor",
  "/api/adl-settings",
  "/api/notifications/evaluate",
  "/api/risk-rules",
  "/api/simulation",
  "/api/strategies",
];

/**
 * Read-only middleware guard.
 *
 * - Blocks POST/PUT/PATCH/DELETE on all other paths to enforce the
 *   read-only policy at the network boundary.
 * - Allows local-only mutation endpoints listed above.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { method } = request;

  // Allow Next.js internals and static files
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.startsWith("/static")) {
    return NextResponse.next();
  }

  // Allow GET and HEAD everywhere
  if (method === "GET" || method === "HEAD") {
    const response = NextResponse.next();
    response.headers.set("X-Read-Only", "true");
    return response;
  }

  // Allow local-only mutation endpoints (config, simulation, etc.)
  if (ALLOWED_MUTATION_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const response = NextResponse.next();
    response.headers.set("X-Read-Only", "true");
    response.headers.set("X-Read-Only-Message", "本地配置端点 — 不影响交易所或真实账户");
    return response;
  }

  // Block all other mutating methods
  return new NextResponse(
    JSON.stringify({
      error: `只读模式不允许 ${method} 请求。本看板仅使用公开行情数据。`,
      code: "READ_ONLY_MODE",
      method,
      path: pathname,
    }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "X-Read-Only": "true",
        "X-Read-Only-Message": "只读看板，不连接 API Key，不下单，不交易",
      },
    }
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
