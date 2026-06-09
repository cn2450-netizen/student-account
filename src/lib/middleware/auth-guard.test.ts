import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { applyAuthGuard } from "./auth-guard";
import type { Session } from "next-auth";

function req(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

const baseSession: Session = {
  user: {
    id: "user-1",
    name: "testuser",
    role: "PARENT",
    forcePasswordChange: false,
  },
  expires: new Date(Date.now() + 3_600_000).toISOString(),
};

describe("applyAuthGuard()", () => {
  describe("unauthenticated (session = null)", () => {
    it("redirects to /login", () => {
      const res = applyAuthGuard(req("/dashboard"), null);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("includes the original path as callbackUrl", () => {
      const res = applyAuthGuard(req("/students"), null);
      expect(res.headers.get("location")).toContain("callbackUrl=%2Fstudents");
    });

    it("encodes nested paths in callbackUrl", () => {
      const res = applyAuthGuard(req("/admin/users"), null);
      expect(res.headers.get("location")).toContain("callbackUrl=%2Fadmin%2Fusers");
    });
  });

  describe("forcePasswordChange = true", () => {
    const forcedSession: Session = {
      ...baseSession,
      user: { ...baseSession.user, forcePasswordChange: true },
    };

    it("redirects to /change-password from any other page", () => {
      const res = applyAuthGuard(req("/dashboard"), forcedSession);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/change-password");
    });

    it("allows access to /change-password itself", () => {
      const res = applyAuthGuard(req("/change-password"), forcedSession);
      expect(res.status).toBe(200);
    });
  });

  describe("normal authenticated session", () => {
    it("passes through to the requested page", () => {
      expect(applyAuthGuard(req("/dashboard"), baseSession).status).toBe(200);
    });

    it("passes through for staff routes", () => {
      const staffSession: Session = {
        ...baseSession,
        user: { ...baseSession.user, role: "ADMIN" },
      };
      expect(applyAuthGuard(req("/admin/users"), staffSession).status).toBe(200);
    });
  });
});
