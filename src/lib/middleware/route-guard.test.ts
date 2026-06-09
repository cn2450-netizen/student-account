import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { applyRouteGuard } from "./route-guard";

function req(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

describe("applyRouteGuard()", () => {
  describe("public paths — returns NextResponse (not null)", () => {
    it.each([
      "/login",
      "/login/",
      "/register",
      "/register/confirm",
      "/change-password",
      "/terms",
    ])("%s", (path) => {
      expect(applyRouteGuard(req(path))).not.toBeNull();
    });
  });

  describe("auth endpoints — passes through regardless of auth state", () => {
    it.each([
      "/api/auth/session",
      "/api/auth/csrf",
      "/api/auth/callback/credentials",
      "/api/auth/signout",
    ])("%s", (path) => {
      expect(applyRouteGuard(req(path))).not.toBeNull();
    });
  });

  describe("protected paths — returns null so auth-guard runs next", () => {
    it.each([
      "/dashboard",
      "/students",
      "/fundraising",
      "/expenses",
      "/settings",
      "/admin/users",
      "/api/students",
    ])("%s", (path) => {
      expect(applyRouteGuard(req(path))).toBeNull();
    });
  });
});
