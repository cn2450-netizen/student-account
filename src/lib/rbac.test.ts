import { describe, it, expect } from "vitest";
import { can } from "./rbac";

describe("can()", () => {
  // ── ADMIN ────────────────────────────────────────────────────────────────
  describe("ADMIN", () => {
    it.each([
      "admin", "settings", "approvals", "allStudents", "allFunds",
      "fundRequests", "manageFundraising", "ownStudents", "ownFunds",
      "unlockAccounts",
    ] as const)("has %s", (p) => expect(can("ADMIN", p)).toBe(true));
  });

  // ── PRESIDENT ────────────────────────────────────────────────────────────
  describe("PRESIDENT", () => {
    it.each(["settings", "approvals", "allStudents", "allFunds", "fundRequests", "unlockAccounts"] as const)(
      "has %s", (p) => expect(can("PRESIDENT", p)).toBe(true)
    );
    it.each(["admin", "manageFundraising", "ownStudents", "ownFunds", "submitRequests"] as const)(
      "does not have %s", (p) => expect(can("PRESIDENT", p)).toBe(false)
    );
  });

  // ── TREASURER ────────────────────────────────────────────────────────────
  describe("TREASURER", () => {
    it.each(["approvals", "allStudents", "allFunds", "fundRequests", "manageFundraising"] as const)(
      "has %s", (p) => expect(can("TREASURER", p)).toBe(true)
    );
    it.each(["admin", "settings", "unlockAccounts", "ownStudents", "ownFunds", "submitRequests"] as const)(
      "does not have %s", (p) => expect(can("TREASURER", p)).toBe(false)
    );
  });

  // ── FUNDRAISING_MANAGER ──────────────────────────────────────────────────
  describe("FUNDRAISING_MANAGER", () => {
    it.each(["allStudents", "manageFundraising"] as const)(
      "has %s", (p) => expect(can("FUNDRAISING_MANAGER", p)).toBe(true)
    );
    it.each([
      "admin", "settings", "approvals", "allFunds", "fundRequests",
      "unlockAccounts", "ownStudents", "ownFunds", "submitRequests",
    ] as const)(
      "does not have %s", (p) => expect(can("FUNDRAISING_MANAGER", p)).toBe(false)
    );
  });

  // ── BOARD_MEMBER ─────────────────────────────────────────────────────────
  describe("BOARD_MEMBER", () => {
    it("has allStudents", () => expect(can("BOARD_MEMBER", "allStudents")).toBe(true));
    it.each([
      "admin", "settings", "approvals", "allFunds", "fundRequests",
      "manageFundraising", "unlockAccounts", "ownStudents", "ownFunds", "submitRequests",
    ] as const)(
      "does not have %s", (p) => expect(can("BOARD_MEMBER", p)).toBe(false)
    );
  });

  // ── PARENT ───────────────────────────────────────────────────────────────
  describe("PARENT", () => {
    it.each(["ownStudents", "ownFunds", "submitRequests"] as const)(
      "has %s", (p) => expect(can("PARENT", p)).toBe(true)
    );
    it.each([
      "admin", "settings", "approvals", "allStudents", "allFunds",
      "fundRequests", "manageFundraising", "unlockAccounts",
    ] as const)(
      "does not have %s", (p) => expect(can("PARENT", p)).toBe(false)
    );
  });

  // ── Edge cases ───────────────────────────────────────────────────────────
  it("returns false for an unknown role", () => {
    expect(can("UNKNOWN", "admin")).toBe(false);
  });

  it("returns false for empty string role", () => {
    expect(can("", "admin")).toBe(false);
  });
});
