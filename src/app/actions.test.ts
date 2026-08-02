import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Module mocks (hoisted — factories must be self-contained) ────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    accountRequest: { findUnique: vi.fn(), update: vi.fn() },
    user: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    parentProfile: { findUnique: vi.fn(), create: vi.fn() },
    student: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    fundraisingEntry: { create: vi.fn() },
    fundRequest: { findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ getCurrentSession: vi.fn() }));

vi.mock("@/lib/email", () => ({
  sendDepositReceipt: vi.fn().mockResolvedValue(true),
  sendAccountApprovedEmail: vi.fn().mockResolvedValue(true),
  sendWithdrawReceipt: vi.fn().mockResolvedValue(true),
  sendFundRequestDecisionEmail: vi.fn().mockResolvedValue(true),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
  sendStaffInviteEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("bcryptjs", () => ({
  hash: vi.fn().mockResolvedValue("mocked-bcrypt-hash"),
  compare: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// ── Imports (resolved against mocks above) ───────────────────────────────────

import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/auth";
import { sendDepositReceipt, sendAccountApprovedEmail, sendFundRequestDecisionEmail, sendPasswordResetEmail, sendStaffInviteEmail } from "@/lib/email";
import {
  advanceGrades,
  approveAccountRequest,
  addFundraisingEntry,
  denyFundRequest,
  requestPasswordReset,
  resetPasswordWithToken,
  resetUserPassword,
  createStaffUser,
  unlockAccount,
} from "@/app/actions";

// ── Typed references to the mocked prisma sub-objects ────────────────────────
// vi.mocked() gives TypeScript the mock type so .mockResolvedValue etc. work.

const mp = vi.mocked(prisma);

// ── Session fixtures ──────────────────────────────────────────────────────────

const adminSession    = { user: { id: "u-admin",     name: "admin@school.org",     role: "ADMIN"     } };
const treasurerSession = { user: { id: "u-treasurer", name: "treasurer@school.org", role: "TREASURER" } };
const parentSession   = { user: { id: "u-parent",    name: "parent@school.org",    role: "PARENT"    } };

// ─────────────────────────────────────────────────────────────────────────────
// advanceGrades()
// ─────────────────────────────────────────────────────────────────────────────

describe("advanceGrades()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no date config (uses July 1), not run this year, no students
    mp.appConfig.findUnique.mockResolvedValue(null);
    mp.student.findMany.mockResolvedValue([]);
    mp.student.update.mockResolvedValue({} as never);
    mp.appConfig.upsert.mockResolvedValue({} as never);
    // $transaction passes prisma itself as the tx object
    mp.$transaction.mockImplementation((fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
  });

  afterEach(() => vi.useRealTimers());

  // ── Auth ───────────────────────────────────────────────────────────────────

  it("returns Unauthorized when there is no session", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    expect(await advanceGrades()).toEqual({ error: "Unauthorized" });
  });

  it("returns Unauthorized for PARENT role", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(parentSession as never);
    expect(await advanceGrades()).toEqual({ error: "Unauthorized" });
  });

  it("allows ADMIN role", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 6, 2)); // July 2 — past the default gate
    expect((await advanceGrades()).error).toBeUndefined();
  });

  it("allows TREASURER role (has fundRequests permission)", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(treasurerSession as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 6, 2));
    expect((await advanceGrades()).error).toBeUndefined();
  });

  // ── Date gate ──────────────────────────────────────────────────────────────

  it("skips and mentions July 1 when run before the default advancement date", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15)); // June 15

    const result = await advanceGrades();
    expect(result.skipped).toMatch(/July 1/i);
  });

  it("runs when the current date equals the default advancement date", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 6, 1)); // July 1 exactly

    const result = await advanceGrades();
    expect(result.skipped).toBeUndefined();
    expect(result.advanced).toBeDefined();
  });

  it("respects a custom advancement date stored in AppConfig", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 4, 20)); // May 20 — before June 1

    mp.appConfig.findUnique.mockImplementation(async ({ where }) =>
      where.key === "gradeAdvancementDate" ? { key: "gradeAdvancementDate", value: "6/1" } : null,
    );

    const result = await advanceGrades();
    expect(result.skipped).toMatch(/June 1/i);
  });

  it("runs when the current date matches a custom advancement date", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 1)); // June 1

    mp.appConfig.findUnique.mockImplementation(async ({ where }) =>
      where.key === "gradeAdvancementDate" ? { key: "gradeAdvancementDate", value: "6/1" } : null,
    );

    const result = await advanceGrades();
    expect(result.skipped).toBeUndefined();
    expect(result.advanced).toBeDefined();
  });

  // ── Year dedup ─────────────────────────────────────────────────────────────

  it("skips when grades have already been advanced for the current year", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 6, 15));

    mp.appConfig.findUnique.mockImplementation(async ({ where }) =>
      where.key === "gradeAdvancementYear" ? { key: "gradeAdvancementYear", value: "2025" } : null,
    );

    const result = await advanceGrades();
    expect(result.skipped).toMatch(/already been advanced for 2025/);
  });

  // ── Force override ─────────────────────────────────────────────────────────

  it("force=true bypasses the date gate", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 1)); // January — well before July 1

    const result = await advanceGrades(true);
    expect(result.skipped).toBeUndefined();
    expect(result.advanced).toBeDefined();
  });

  it("force=true bypasses the already-run-this-year guard", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 6, 15));

    mp.appConfig.findUnique.mockImplementation(async ({ where }) =>
      where.key === "gradeAdvancementYear" ? { key: "gradeAdvancementYear", value: "2025" } : null,
    );

    const result = await advanceGrades(true);
    expect(result.skipped).toBeUndefined();
  });

  // ── Grade logic ────────────────────────────────────────────────────────────

  it("graduates grade-12 students and advances all others", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 6, 2));

    mp.student.findMany.mockResolvedValue([
      { id: "s12", grade: "12" },
      { id: "s11", grade: "11" },
      { id: "s10", grade: "10" },
    ] as never);

    const result = await advanceGrades();
    expect(result.graduated).toBe(1);
    expect(result.advanced).toBe(2);
  });

  it("marks grade-12 student as graduated=true with a graduatedAt timestamp", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.useFakeTimers();
    const now = new Date(2025, 6, 2);
    vi.setSystemTime(now);

    mp.student.findMany.mockResolvedValue([{ id: "s12", grade: "12" }] as never);

    await advanceGrades();

    const updateCall = mp.student.update.mock.calls.find(
      ([args]) => (args as { where: { id: string } }).where.id === "s12",
    );
    expect((updateCall?.[0] as { data: { graduated: boolean; graduatedAt: Date } }).data.graduated).toBe(true);
    expect((updateCall?.[0] as { data: { graduated: boolean; graduatedAt: Date } }).data.graduatedAt).toEqual(now);
  });

  it("increments the grade by 1 for students below grade 12", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 6, 2));

    mp.student.findMany.mockResolvedValue([{ id: "s9", grade: "9" }] as never);

    await advanceGrades();

    const updateCall = mp.student.update.mock.calls.find(
      ([args]) => (args as { where: { id: string } }).where.id === "s9",
    );
    expect((updateCall?.[0] as { data: { grade: string } }).data.grade).toBe("10");
  });

  it("skips students with non-numeric grades (null or letters)", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 6, 2));

    mp.student.findMany.mockResolvedValue([
      { id: "s-k",    grade: "K"   },
      { id: "s-null", grade: null  },
      { id: "s10",    grade: "10"  },
    ] as never);

    const result = await advanceGrades();

    expect(result.advanced).toBe(1);
    expect(result.graduated).toBe(0);
    expect(mp.student.update).toHaveBeenCalledOnce();
  });

  it("records the advancement year in AppConfig to prevent re-running", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 6, 2));

    await advanceGrades();

    expect(mp.appConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "gradeAdvancementYear" },
        update: { value: "2025" },
        create: { key: "gradeAdvancementYear", value: "2025" },
      }),
    );
  });

  it("returns advanced=0 and graduated=0 when no active students exist", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 6, 2));

    const result = await advanceGrades();
    expect(result.advanced).toBe(0);
    expect(result.graduated).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// approveAccountRequest()
// ─────────────────────────────────────────────────────────────────────────────

describe("approveAccountRequest()", () => {
  const PENDING_REQUEST = {
    id: "req-1",
    email: "parent@example.com",
    firstName: "Jane",
    lastName: "Doe",
    phone: "555-1234",
    status: "PENDING",
    assignedTo: null, reviewedAt: null, reviewedBy: null,
    createdAt: new Date(), updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mp.accountRequest.findUnique.mockResolvedValue(PENDING_REQUEST as never);
    mp.user.create.mockResolvedValue({ id: "new-user-id", username: "parent@example.com" } as never);
    mp.parentProfile.create.mockResolvedValue({} as never);
    mp.accountRequest.update.mockResolvedValue({} as never);
    mp.$transaction.mockImplementation((fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it("returns Unauthorized when there is no session", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    expect(await approveAccountRequest("req-1")).toEqual({ error: "Unauthorized" });
  });

  it("returns Unauthorized for PARENT role", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(parentSession as never);
    expect(await approveAccountRequest("req-1")).toEqual({ error: "Unauthorized" });
  });

  // ── Not found / already processed ─────────────────────────────────────────

  it("returns an error when the request does not exist", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    mp.accountRequest.findUnique.mockResolvedValue(null);
    expect(await approveAccountRequest("missing")).toEqual({ error: "Request not found or already processed" });
  });

  it("returns an error when the request is already APPROVED", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    mp.accountRequest.findUnique.mockResolvedValue({ ...PENDING_REQUEST, status: "APPROVED" } as never);
    expect(await approveAccountRequest("req-1")).toEqual({ error: "Request not found or already processed" });
  });

  it("returns an error when the request is REJECTED", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    mp.accountRequest.findUnique.mockResolvedValue({ ...PENDING_REQUEST, status: "REJECTED" } as never);
    expect(await approveAccountRequest("req-1")).toEqual({ error: "Request not found or already processed" });
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("creates a User with the parent email as username and PARENT role", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);

    await approveAccountRequest("req-1");

    expect(mp.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ username: "parent@example.com", role: "PARENT" }),
      }),
    );
  });

  it("creates a ParentProfile linked to the new user with the request's name and phone", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);

    await approveAccountRequest("req-1");

    expect(mp.parentProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "new-user-id",
          firstName: "Jane",
          lastName: "Doe",
          phone: "555-1234",
        }),
      }),
    );
  });

  it("marks the AccountRequest as APPROVED with the reviewer's name", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);

    await approveAccountRequest("req-1");

    expect(mp.accountRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "req-1" },
        data: expect.objectContaining({ status: "APPROVED", reviewedBy: "admin@school.org" }),
      }),
    );
  });

  it("always forces a password change with an unusable random placeholder hash", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);

    await approveAccountRequest("req-1");

    expect(mp.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ forcePasswordChange: true, passwordHash: expect.any(String) }),
      }),
    );
  });

  it("returns success with emailSent status and parent email", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    expect(await approveAccountRequest("req-1")).toEqual({
      success: true,
      emailSent: true,
      parentEmail: "parent@example.com",
    });
  });

  it("returns emailSent=false when the email send fails", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.mocked(sendAccountApprovedEmail).mockResolvedValueOnce(false);
    const result = await approveAccountRequest("req-1");
    expect(result).toMatchObject({ success: true, emailSent: false });
  });

  it("sends a set-password email with a reset link to the parent", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);

    await approveAccountRequest("req-1");

    expect(sendAccountApprovedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "parent@example.com",
        parentName: "Jane Doe",
        resetUrl: expect.stringContaining("/reset-password?token="),
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// addFundraisingEntry()
// ─────────────────────────────────────────────────────────────────────────────

describe("addFundraisingEntry()", () => {
  function makeFormData(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return fd;
  }

  const VALID_FIELDS = { studentId: "student-1", amount: "50.00", description: "Candy sale" };

  const STUDENT_WITH_PROFILE = {
    id: "student-1",
    firstName: "Alice",
    lastName: "Doe",
    profile: {
      firstName: "Jane",
      lastName: "Doe",
      user: { username: "parent@example.com" },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mp.fundraisingEntry.create.mockResolvedValue({} as never);
    mp.student.findUnique.mockResolvedValue(STUDENT_WITH_PROFILE as never);
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it("returns not-authenticated error when there is no session", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    expect((await addFundraisingEntry({}, makeFormData(VALID_FIELDS))).error).toMatch(/not authenticated/i);
  });

  it("returns Unauthorized when the role has neither manageFundraising nor ownFunds", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({ user: { id: "u-1", name: "x", role: "BOARD_MEMBER" } } as never);
    expect((await addFundraisingEntry({}, makeFormData(VALID_FIELDS))).error).toMatch(/unauthorized/i);
  });

  // ── Input validation ───────────────────────────────────────────────────────

  it("returns a validation error for a negative amount", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(treasurerSession as never);
    const result = await addFundraisingEntry({}, makeFormData({ ...VALID_FIELDS, amount: "-5" }));
    expect(result.error).toBeDefined();
    expect(result.success).toBeUndefined();
  });

  it("returns a validation error for a zero amount", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(treasurerSession as never);
    const result = await addFundraisingEntry({}, makeFormData({ ...VALID_FIELDS, amount: "0" }));
    expect(result.error).toBeDefined();
  });

  it("returns a validation error when description is empty", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(treasurerSession as never);
    const result = await addFundraisingEntry({}, makeFormData({ ...VALID_FIELDS, description: "" }));
    expect(result.error).toBeDefined();
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("creates a FundraisingEntry with the correct studentId and description", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(treasurerSession as never);

    const result = await addFundraisingEntry({}, makeFormData(VALID_FIELDS));

    expect(result.success).toBe(true);
    expect(mp.fundraisingEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ studentId: "student-1", description: "Candy sale" }),
      }),
    );
  });

  it("triggers a deposit receipt email with the parent and student details", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(treasurerSession as never);

    await addFundraisingEntry({}, makeFormData(VALID_FIELDS));

    expect(sendDepositReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "parent@example.com",
        parentName: "Jane Doe",
        studentName: "Alice Doe",
        studentId: "student-1",
        amount: "50.00",
        description: "Candy sale",
      }),
    );
  });

  it("does not send an email when the student has no linked parent profile", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(treasurerSession as never);
    mp.student.findUnique.mockResolvedValue({ ...STUDENT_WITH_PROFILE, profile: null } as never);

    await addFundraisingEntry({}, makeFormData(VALID_FIELDS));

    expect(sendDepositReceipt).not.toHaveBeenCalled();
  });

  it("still returns success even if the email send throws", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(treasurerSession as never);
    vi.mocked(sendDepositReceipt).mockRejectedValueOnce(new Error("SMTP down"));

    expect((await addFundraisingEntry({}, makeFormData(VALID_FIELDS))).success).toBe(true);
  });
});

describe("denyFundRequest()", () => {
  const PENDING_REQUEST = {
    id: "req-1",
    studentId: "student-1",
    description: "Field trip",
    amount: 45,
    status: "PENDING",
    notes: null,
    student: {
      id: "student-1",
      firstName: "Alice",
      lastName: "Doe",
      profile: {
        firstName: "Jane",
        lastName: "Doe",
        user: { username: "parent@example.com" },
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mp.fundRequest.findUnique.mockResolvedValue(PENDING_REQUEST as never);
    mp.fundRequest.update.mockResolvedValue({} as never);
  });

  it("sends a denial email with the rejection reason to the parent", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(treasurerSession as never);

    await denyFundRequest("req-1", "Missing paperwork");

    expect(sendFundRequestDecisionEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "parent@example.com",
        parentName: "Jane Doe",
        studentName: "Alice Doe",
        studentId: "student-1",
        status: "DENIED",
        reason: "Missing paperwork",
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requestPasswordReset()
// ─────────────────────────────────────────────────────────────────────────────

describe("requestPasswordReset()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mp.passwordResetToken.create.mockResolvedValue({} as never);
  });

  function formData(email: string) {
    const fd = new FormData();
    fd.set("email", email);
    return fd;
  }

  it("returns success without creating a token when no user matches the email", async () => {
    mp.user.findUnique.mockResolvedValue(null as never);

    const result = await requestPasswordReset({}, formData("nobody@example.com"));

    expect(result.success).toBe(true);
    expect(mp.passwordResetToken.create).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("normalizes email casing/whitespace, creates a token, and emails the reset link", async () => {
    mp.user.findUnique.mockResolvedValue({ id: "user-1", username: "parent@example.com" } as never);
    mp.passwordResetToken.findFirst.mockResolvedValue(null as never);

    const result = await requestPasswordReset({}, formData("  Parent@Example.com  "));

    expect(mp.user.findUnique).toHaveBeenCalledWith({ where: { username: "parent@example.com" } });
    expect(mp.passwordResetToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-1" }) }),
    );
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "parent@example.com",
        resetUrl: expect.stringContaining("/reset-password?token="),
      }),
    );
    expect(result.success).toBe(true);
  });

  it("skips creating a new token when one was already requested recently", async () => {
    mp.user.findUnique.mockResolvedValue({ id: "user-1", username: "parent@example.com" } as never);
    mp.passwordResetToken.findFirst.mockResolvedValue({ id: "existing-token" } as never);

    const result = await requestPasswordReset({}, formData("parent@example.com"));

    expect(mp.passwordResetToken.create).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resetPasswordWithToken()
// ─────────────────────────────────────────────────────────────────────────────

describe("resetPasswordWithToken()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mp.$transaction.mockResolvedValue([{}, {}] as never);
  });

  function formData(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  it("rejects mismatched passwords before ever looking up the token", async () => {
    const result = await resetPasswordWithToken(
      {},
      formData({ token: "x", newPassword: "NewPass123", confirmPassword: "Different1" }),
    );

    expect(result.error).toMatch(/do not match/i);
    expect(mp.passwordResetToken.findUnique).not.toHaveBeenCalled();
  });

  it("rejects when the token doesn't exist", async () => {
    mp.passwordResetToken.findUnique.mockResolvedValue(null as never);

    const result = await resetPasswordWithToken(
      {},
      formData({ token: "bad", newPassword: "NewPass123", confirmPassword: "NewPass123" }),
    );

    expect(result.error).toMatch(/invalid or has expired/i);
  });

  it("rejects an already-used token", async () => {
    mp.passwordResetToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "user-1",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 100_000),
    } as never);

    const result = await resetPasswordWithToken(
      {},
      formData({ token: "used", newPassword: "NewPass123", confirmPassword: "NewPass123" }),
    );

    expect(result.error).toMatch(/invalid or has expired/i);
  });

  it("rejects an expired token", async () => {
    mp.passwordResetToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "user-1",
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    } as never);

    const result = await resetPasswordWithToken(
      {},
      formData({ token: "expired", newPassword: "NewPass123", confirmPassword: "NewPass123" }),
    );

    expect(result.error).toMatch(/invalid or has expired/i);
  });

  it("updates the password, clears lockout state, and marks the token used on success", async () => {
    mp.passwordResetToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "user-1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 100_000),
    } as never);

    const result = await resetPasswordWithToken(
      {},
      formData({ token: "good", newPassword: "NewPass123", confirmPassword: "NewPass123" }),
    );

    expect(result.success).toBe(true);
    expect(mp.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({
          forcePasswordChange: false,
          loginAttempts: 0,
          loginWindowStart: null,
          lockedUntil: null,
          permanentLock: false,
        }),
      }),
    );
    expect(mp.passwordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1" }, data: expect.objectContaining({ usedAt: expect.any(Date) }) }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resetUserPassword()
// ─────────────────────────────────────────────────────────────────────────────

describe("resetUserPassword()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mp.user.findUnique.mockResolvedValue({ id: "user-1", username: "parent@example.com" } as never);
    mp.user.update.mockResolvedValue({} as never);
    mp.passwordResetToken.create.mockResolvedValue({} as never);
  });

  it("returns Unauthorized for a non-admin session", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(treasurerSession as never);
    expect(await resetUserPassword("user-1")).toEqual({ error: "Unauthorized" });
  });

  it("refuses to reset your own password through this path", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    expect(await resetUserPassword("u-admin")).toEqual({
      error: "Use the change password form to update your own password",
    });
  });

  it("returns an error when the target user doesn't exist", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    mp.user.findUnique.mockResolvedValue(null as never);
    expect(await resetUserPassword("missing")).toEqual({ error: "User not found" });
  });

  it("invalidates the current password, forces a change, and clears lockout state", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);

    await resetUserPassword("user-1");

    expect(mp.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({
          forcePasswordChange: true,
          loginAttempts: 0,
          loginWindowStart: null,
          lockedUntil: null,
          permanentLock: false,
        }),
      }),
    );
  });

  it("emails a reset link and returns success with emailSent status", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);

    const result = await resetUserPassword("user-1");

    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "parent@example.com",
        resetUrl: expect.stringContaining("/reset-password?token="),
      }),
    );
    expect(result).toEqual({ success: true, emailSent: true });
  });

  it("still returns success when the email fails to send", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.mocked(sendPasswordResetEmail).mockResolvedValueOnce(false);

    const result = await resetUserPassword("user-1");

    expect(result).toEqual({ success: true, emailSent: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createStaffUser()
// ─────────────────────────────────────────────────────────────────────────────

describe("createStaffUser()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mp.user.findUnique.mockResolvedValue(null as never);
    mp.user.findFirst.mockResolvedValue(null as never);
    mp.user.create.mockResolvedValue({ id: "new-staff-id", username: "treasurer@school.org" } as never);
    mp.passwordResetToken.create.mockResolvedValue({} as never);
  });

  function formData(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  it("returns Unauthorized for a non-admin session", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(treasurerSession as never);
    const result = await createStaffUser({}, formData({ username: "treasurer@school.org", role: "TREASURER" }));
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("rejects a non-email username", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    const result = await createStaffUser({}, formData({ username: "treasurer1", role: "TREASURER" }));
    expect(result.error).toMatch(/valid email/i);
    expect(mp.user.create).not.toHaveBeenCalled();
  });

  it("rejects a duplicate username", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    mp.user.findUnique.mockResolvedValue({ id: "existing" } as never);
    const result = await createStaffUser({}, formData({ username: "treasurer@school.org", role: "TREASURER" }));
    expect(result.error).toMatch(/already exists/i);
  });

  it("rejects a second TREASURER account", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    mp.user.findFirst.mockResolvedValue({ username: "existing-treasurer@school.org" } as never);
    const result = await createStaffUser({}, formData({ username: "new-treasurer@school.org", role: "TREASURER" }));
    expect(result.error).toMatch(/treasurer account already exists/i);
  });

  it("creates the user with an unusable placeholder hash and forcePasswordChange true", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);

    await createStaffUser({}, formData({ username: "Treasurer@School.org", role: "TREASURER" }));

    expect(mp.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          username: "treasurer@school.org",
          role: "TREASURER",
          forcePasswordChange: true,
          passwordHash: expect.any(String),
        }),
      }),
    );
  });

  it("emails an invite link and returns success with emailSent status", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);

    const result = await createStaffUser({}, formData({ username: "treasurer@school.org", role: "TREASURER" }));

    expect(sendStaffInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "treasurer@school.org",
        resetUrl: expect.stringContaining("/reset-password?token="),
      }),
    );
    expect(result).toEqual({ success: true, emailSent: true });
  });

  it("still returns success when the invite email fails to send", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.mocked(sendStaffInviteEmail).mockResolvedValueOnce(false);

    const result = await createStaffUser({}, formData({ username: "treasurer@school.org", role: "TREASURER" }));

    expect(result).toEqual({ success: true, emailSent: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// unlockAccount()
// ─────────────────────────────────────────────────────────────────────────────

describe("unlockAccount()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mp.user.findUnique.mockResolvedValue({
      id: "user-1",
      username: "parent@example.com",
      permanentLock: true,
    } as never);
    mp.user.update.mockResolvedValue({} as never);
    mp.passwordResetToken.create.mockResolvedValue({} as never);
  });

  it("returns Unauthorized for a role without unlockAccounts permission", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(treasurerSession as never);
    expect(await unlockAccount("user-1")).toEqual({ error: "Unauthorized" });
  });

  it("returns an error when the user doesn't exist", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    mp.user.findUnique.mockResolvedValue(null as never);
    expect(await unlockAccount("missing")).toEqual({ error: "User not found" });
  });

  it("returns an error when the account isn't permanently locked", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    mp.user.findUnique.mockResolvedValue({ id: "user-1", username: "parent@example.com", permanentLock: false } as never);
    expect(await unlockAccount("user-1")).toEqual({ error: "Account is not permanently locked" });
  });

  it("invalidates the password and clears all lockout state", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);

    await unlockAccount("user-1");

    expect(mp.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({
          passwordHash: expect.any(String),
          permanentLock: false,
          forcePasswordChange: true,
          lockoutCount: 0,
          loginAttempts: 0,
          loginWindowStart: null,
          lockedUntil: null,
        }),
      }),
    );
  });

  it("emails a reset link and returns success with emailSent status", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);

    const result = await unlockAccount("user-1");

    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "parent@example.com",
        resetUrl: expect.stringContaining("/reset-password?token="),
      }),
    );
    expect(result).toEqual({ success: true, emailSent: true });
  });

  it("still returns success when the email fails to send", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.mocked(sendPasswordResetEmail).mockResolvedValueOnce(false);

    const result = await unlockAccount("user-1");

    expect(result).toEqual({ success: true, emailSent: false });
  });
});
