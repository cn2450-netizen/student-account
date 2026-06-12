import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Module mocks (hoisted — factories must be self-contained) ────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    accountRequest: { findUnique: vi.fn(), update: vi.fn() },
    user: { create: vi.fn() },
    parentProfile: { findUnique: vi.fn(), create: vi.fn() },
    student: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    fundraisingEntry: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ getCurrentSession: vi.fn() }));

vi.mock("@/lib/email", () => ({
  sendDepositReceipt: vi.fn().mockResolvedValue(undefined),
  sendApprovalEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("bcryptjs", () => ({
  hash: vi.fn().mockResolvedValue("mocked-bcrypt-hash"),
  compare: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// ── Imports (resolved against mocks above) ───────────────────────────────────

import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/auth";
import { sendDepositReceipt, sendApprovalEmail } from "@/lib/email";
import { advanceGrades, approveAccountRequest, addFundraisingEntry } from "@/app/actions";

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
    passwordHash: "existing-hash",
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

  it("does not force a password change when the request already has a passwordHash", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);

    await approveAccountRequest("req-1"); // PENDING_REQUEST.passwordHash = "existing-hash"

    expect(mp.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordHash: "existing-hash", forcePasswordChange: false }),
      }),
    );
  });

  it("forces a password change when the request has no passwordHash", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    mp.accountRequest.findUnique.mockResolvedValue({ ...PENDING_REQUEST, passwordHash: null } as never);

    await approveAccountRequest("req-1");

    expect(mp.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ forcePasswordChange: true }),
      }),
    );
  });

  it("returns { success: true } on completion", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    expect(await approveAccountRequest("req-1")).toEqual({ success: true });
  });

  it("sends an approval email with the parent's name and email", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);

    await approveAccountRequest("req-1");

    expect(sendApprovalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "parent@example.com", parentName: "Jane Doe" }),
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
