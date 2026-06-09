import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { NEXTAUTH_SECRET } from "@/lib/env";

export async function applyAuthGuard(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req, secret: NEXTAUTH_SECRET });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (token.forcePasswordChange && pathname !== "/change-password") {
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  return NextResponse.next();
}
