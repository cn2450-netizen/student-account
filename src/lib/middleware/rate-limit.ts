import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// In-memory store — intentional for this single-instance systemd deployment.
// Counters reset on process restart, but that is acceptable here because the
// persistent defense layer is the per-account DB lockout in src/lib/auth.ts
// (5 bad attempts → 30-min lock; 3 lockouts → permanent lock).
// For multi-instance or serverless deployments, replace loginAttempts with a
// shared store such as Redis (@upstash/ratelimit is a drop-in for Edge runtime).
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now >= record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (record.count >= RATE_LIMIT_MAX) return true;
  record.count++;
  return false;
}

export function applyRateLimit(req: NextRequest): NextResponse | null {
  if (req.method !== "POST" || req.nextUrl.pathname !== "/api/auth/callback/credentials") {
    return null;
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  if (checkLoginRateLimit(ip)) {
    return new NextResponse("Too many login attempts. Please try again later.", {
      status: 429,
      headers: { "Retry-After": "900", "Content-Type": "text/plain" },
    });
  }
  return null;
}
