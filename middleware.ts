import { auth } from "@/lib/auth";
import { applyRateLimit } from "@/lib/middleware/rate-limit";
import { applyRouteGuard } from "@/lib/middleware/route-guard";
import { applyAuthGuard } from "@/lib/middleware/auth-guard";

export default auth((req) => {
  const rateLimitResponse = applyRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  const routeGuardResponse = applyRouteGuard(req);
  if (routeGuardResponse) return routeGuardResponse;

  return applyAuthGuard(req, req.auth);
});

export const config = {
  matcher: ["/:path*"],
};
