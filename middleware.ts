import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { applyRouteGuard } from "@/lib/middleware/route-guard";
import { applyAuthGuard } from "@/lib/middleware/auth-guard";

// Use the Edge-safe config so Prisma (Node.js-only) is never bundled
// into the middleware. JWT verification only needs the secret + callbacks.
const { auth } = NextAuth(authConfig);

type AuthRequest = NextRequest & { auth: Session | null };

export default auth((req: AuthRequest) => {
  const routeGuardResponse = applyRouteGuard(req);
  if (routeGuardResponse) return routeGuardResponse;

  return applyAuthGuard(req, req.auth);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
