import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { applyRateLimit } from "@/lib/middleware/rate-limit";
import { applyRouteGuard } from "@/lib/middleware/route-guard";
import { applyAuthGuard } from "@/lib/middleware/auth-guard";

type AuthRequest = NextRequest & { auth: Session | null };

export default auth((req: AuthRequest) => {
  const rateLimitResponse = applyRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  const routeGuardResponse = applyRouteGuard(req);
  if (routeGuardResponse) return routeGuardResponse;

  return applyAuthGuard(req, req.auth);
});

export const config = {
  matcher: ["/:path*"],
};
