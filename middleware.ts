import type { NextRequest } from "next/server";
import { applyRateLimit } from "@/lib/middleware/rate-limit";
import { applyRouteGuard } from "@/lib/middleware/route-guard";
import { applyAuthGuard } from "@/lib/middleware/auth-guard";

export async function middleware(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  const routeGuardResponse = applyRouteGuard(req);
  if (routeGuardResponse) return routeGuardResponse;

  return applyAuthGuard(req);
}

export const config = {
  matcher: ["/:path*"],
};
