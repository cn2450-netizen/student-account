import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

// ── Module mocks (hoisted — factories must be self-contained) ────────────────
// mockDeep<PrismaClient>() gives every model method (however generic its
// signature) a real vitest mock fn underneath, which vi.mocked()/manual
// typing can't do for Prisma's generic client methods.

vi.mock("@/lib/prisma", () => ({
  prisma: mockDeep<PrismaClient>(),
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

vi.mock("@/lib/backup", () => ({
  runBackup: vi.fn().mockResolvedValue({ success: true, filename: "moneyfinder-test.sql.gz" }),
  saveBackupSchedule: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("bcryptjs", () => ({
  hash: vi.fn().mockResolvedValue("mocked-bcrypt-hash"),
  compare: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/headers", () => ({ headers: vi.fn() }));

// ── Imports (resolved against mocks above) ───────────────────────────────────

import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/auth";
import { headers } from "next/headers";
import { sendDepositReceipt, sendAccountApprovedEmail, sendFundRequestDecisionEmail, sendPasswordResetEmail, sendStaffInviteEmail } from "@/lib/email";
import { runBackup, saveBackupSchedule } from "@/lib/backup";
import {
  advanceGrades,
  approveAccountRequest,
  registerParentAccount,
  addFundraisingEntry,
  denyFundRequest,
  requestPasswordReset,
  resetPasswordWithToken,
  resetUserPassword,
  runBackupNow,
  saveBackupConfig,
  createStaffUser,
  unlockAccount,
  updateStaffEmail,
  editFundraisingEntry,
  submitFundRequest,
  approveFundRequest,
  transferGraduatedBalance,
} from "@/app/actions";

// ── Typed references to the mocked prisma sub-objects ────────────────────────
// prisma is a DeepMockProxy under the hood (see mockDeep() above); this cast
// gives TypeScript that shape so .mockResolvedValue etc. work.

const mp = prisma as unknown as DeepMockProxy<PrismaClient>;

// ── Session fixtures ──────────────────────────────────────────────────────────

const adminSession    = { user: { id: "u-admin",     name: "admin@school.org",     role: "ADMIN"     } };
const presidentSession = { user: { id: "u-president", name: "president@school.org", role: "PRESIDENT" } };
const treasurerSession = { user: { id: "u-treasurer", name: "treasurer@school.org", role: "TREASURER" } };
const parentSession   = { user: { id: "u-parent",    name: "parent@school.org",    role: "PARENT"    } };
const fundraisingManagerSession = { user: { id: "u-fm", name: "fm@school.org", role: "FUNDRAISING_MANAGER" } };
const boardMemberSession = { user: { id: "u-board", name: "board@school.org", role: "BOARD_MEMBER" } };

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
    vi.mocked(getCurrentSession).mockResolvedValue(null as never);
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

    mp.appConfig.findUnique.mockImplementation((async ({ where }: { where: { key: string } }) =>
      where.key === "gradeAdvancementDate" ? { key: "gradeAdvancementDate", value: "6/1" } : null
    ) as never);

    const result = await advanceGrades();
    expect(result.skipped).toMatch(/June 1/i);
  });

  it("runs when the current date matches a custom advancement date", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 1)); // June 1

    mp.appConfig.findUnique.mockImplementation((async ({ where }: { where: { key: string } }) =>
      where.key === "gradeAdvancementDate" ? { key: "gradeAdvancementDate", value: "6/1" } : null
    ) as never);

    const result = await advanceGrades();
    expect(result.skipped).toBeUndefined();
    expect(result.advanced).toBeDefined();
  });

  // ── Year dedup ─────────────────────────────────────────────────────────────

  it("skips when grades have already been advanced for the current year", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 6, 15));

    mp.appConfig.findUnique.mockImplementation((async ({ where }: { where: { key: string } }) =>
      where.key === "gradeAdvancementYear" ? { key: "gradeAdvancementYear", value: "2025" } : null
    ) as never);

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

    mp.appConfig.findUnique.mockImplementation((async ({ where }: { where: { key: string } }) =>
      where.key === "gradeAdvancementYear" ? { key: "gradeAdvancementYear", value: "2025" } : null
    ) as never);

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
// registerParentAccount()
// ─────────────────────────────────────────────────────────────────────────────

function makeRegisterFormData(overrides: Partial<Record<string, string>> = {}): FormData {
  const fd = new FormData();
  const fields = {
    firstName: "Jane",
    lastName: "Doe",
    phone: "555-0100",
    email: "jane@example.com",
    ...overrides,
  };
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("registerParentAccount()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(headers).mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.5" }) as never);
    mp.accountRequest.findUnique.mockResolvedValue(null);
    mp.user.findUnique.mockResolvedValue(null);
    mp.accountRequest.create.mockResolvedValue({} as never);
    mp.ipRateLimit.findUnique.mockResolvedValue(null);
    mp.ipRateLimit.upsert.mockResolvedValue({} as never);
    mp.ipRateLimit.update.mockResolvedValue({} as never);
  });

  it("creates an account request on a fresh submission", async () => {
    const result = await registerParentAccount({}, makeRegisterFormData());
    expect(result.success).toBe(true);
    expect(prisma.accountRequest.create).toHaveBeenCalledOnce();
  });

  it("blocks once the per-IP attempt limit is reached within the window", async () => {
    mp.ipRateLimit.findUnique.mockResolvedValue({
      ip: "register:203.0.113.5",
      count: 5,
      resetAt: new Date(Date.now() + 60_000),
    } as never);

    const result = await registerParentAccount({}, makeRegisterFormData());

    expect(result.error).toMatch(/too many/i);
    expect(prisma.accountRequest.create).not.toHaveBeenCalled();
  });

  it("allows a submission once the rate-limit window has expired", async () => {
    mp.ipRateLimit.findUnique.mockResolvedValue({
      ip: "register:203.0.113.5",
      count: 5,
      resetAt: new Date(Date.now() - 1_000), // window already elapsed
    } as never);

    const result = await registerParentAccount({}, makeRegisterFormData());

    expect(result.success).toBe(true);
    expect(prisma.accountRequest.create).toHaveBeenCalledOnce();
  });

  it("scopes the rate limit per IP — a different IP is unaffected by another's count", async () => {
    mp.ipRateLimit.findUnique.mockImplementation((async ({ where }: { where: { ip: string } }) =>
      where.ip === "register:203.0.113.5"
        ? { ip: where.ip, count: 5, resetAt: new Date(Date.now() + 60_000) }
        : null
    ) as never);
    vi.mocked(headers).mockResolvedValue(new Headers({ "x-forwarded-for": "198.51.100.9" }) as never);

    const result = await registerParentAccount({}, makeRegisterFormData());

    expect(result.success).toBe(true);
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
    vi.mocked(getCurrentSession).mockResolvedValue(null as never);
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
    vi.mocked(getCurrentSession).mockResolvedValue(null as never);
    expect((await addFundraisingEntry({}, makeFormData(VALID_FIELDS))).error).toMatch(/not authenticated/i);
  });

  it("returns Unauthorized when the role has neither manageFundraising nor ownFunds", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({ user: { id: "u-1", name: "x", role: "BOARD_MEMBER" } } as never);
    expect((await addFundraisingEntry({}, makeFormData(VALID_FIELDS))).error).toMatch(/unauthorized/i);
  });

  it("rejects when the student has graduated", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(treasurerSession as never);
    mp.student.findUnique.mockResolvedValue({ ...STUDENT_WITH_PROFILE, graduated: true } as never);

    const result = await addFundraisingEntry({}, makeFormData(VALID_FIELDS));

    expect(result.error).toMatch(/graduated/i);
    expect(mp.fundraisingEntry.create).not.toHaveBeenCalled();
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

// ─────────────────────────────────────────────────────────────────────────────
// updateStaffEmail()
// ─────────────────────────────────────────────────────────────────────────────

describe("updateStaffEmail()", () => {
  // findUnique is called twice with different `where` shapes (id lookup, then
  // username-collision check) — branch on the shape instead of chaining
  // mockResolvedValueOnce, since not every test consumes both calls.
  function mockFindUnique(target: unknown, collision: unknown = null) {
    mp.user.findUnique.mockImplementation((async ({ where }: { where: { id?: string; username?: string } }) => {
      if (where.id !== undefined) return target;
      return collision;
    }) as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique({ id: "staff-1", role: "TREASURER" });
    mp.user.update.mockResolvedValue({} as never);
  });

  function formData(email: string) {
    const fd = new FormData();
    fd.set("email", email);
    return fd;
  }

  it("returns Unauthorized for a role without manageStaffAccounts permission", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(treasurerSession as never);
    expect(await updateStaffEmail("staff-1", formData("new@school.org"))).toEqual({ error: "Unauthorized" });
  });

  it("allows PRESIDENT (not just ADMIN)", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(presidentSession as never);
    const result = await updateStaffEmail("staff-1", formData("new@school.org"));
    expect(result).toEqual({ success: true });
  });

  it("rejects a non-email value", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    const result = await updateStaffEmail("staff-1", formData("not-an-email"));
    expect(result.error).toMatch(/valid email/i);
    expect(mp.user.update).not.toHaveBeenCalled();
  });

  it("returns an error when the target user doesn't exist", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    mockFindUnique(null);
    const result = await updateStaffEmail("missing", formData("new@school.org"));
    expect(result).toEqual({ error: "User not found" });
  });

  it("refuses to rename a PARENT account", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    mockFindUnique({ id: "parent-1", role: "PARENT" });
    const result = await updateStaffEmail("parent-1", formData("new@school.org"));
    expect(result.error).toMatch(/staff accounts/i);
  });

  it("rejects a duplicate email already used by another account", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    mockFindUnique({ id: "staff-1", role: "TREASURER" }, { id: "other-user" });
    const result = await updateStaffEmail("staff-1", formData("taken@school.org"));
    expect(result.error).toMatch(/already exists/i);
    expect(mp.user.update).not.toHaveBeenCalled();
  });

  it("normalizes casing/whitespace and updates the username", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);

    await updateStaffEmail("staff-1", formData("  New@School.org  "));

    expect(mp.user.update).toHaveBeenCalledWith({
      where: { id: "staff-1" },
      data: { username: "new@school.org" },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// editFundraisingEntry()
// ─────────────────────────────────────────────────────────────────────────────

describe("editFundraisingEntry()", () => {
  const EXISTING_ENTRY = { id: "entry-1", amount: 100, description: "Candy sale" };

  beforeEach(() => {
    vi.clearAllMocks();
    mp.fundraisingEntry.findUnique.mockResolvedValue(EXISTING_ENTRY as never);
    mp.$transaction.mockResolvedValue([{}, {}] as never);
  });

  function formData(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  const VALID_FIELDS = { amount: "10", description: "Candy sale", reason: "Typo — entered $100 instead of $10" };

  it("allows roles with manageFundraising (admin, treasurer, fundraising manager)", async () => {
    for (const session of [adminSession, treasurerSession, fundraisingManagerSession]) {
      vi.mocked(getCurrentSession).mockResolvedValue(session as never);
      const result = await editFundraisingEntry("entry-1", formData(VALID_FIELDS));
      expect(result).toEqual({ success: true });
    }
  });

  it("returns Unauthorized for a board member, who can't create entries either", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(boardMemberSession as never);
    const result = await editFundraisingEntry("entry-1", formData(VALID_FIELDS));
    expect(result).toEqual({ error: "Unauthorized" });
    expect(mp.$transaction).not.toHaveBeenCalled();
  });

  it("returns Unauthorized for president (view-only on this audit trail)", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(presidentSession as never);
    const result = await editFundraisingEntry("entry-1", formData(VALID_FIELDS));
    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("requires a reason", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    const result = await editFundraisingEntry("entry-1", formData({ amount: "10", description: "Candy sale", reason: "" }));
    expect(result.error).toMatch(/reason/i);
    expect(mp.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a non-positive amount", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    const result = await editFundraisingEntry("entry-1", formData({ ...VALID_FIELDS, amount: "0" }));
    expect(result.error).toMatch(/positive/i);
  });

  it("returns an error when the entry doesn't exist", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    mp.fundraisingEntry.findUnique.mockResolvedValue(null as never);
    const result = await editFundraisingEntry("missing", formData(VALID_FIELDS));
    expect(result).toEqual({ error: "Entry not found" });
  });

  it("logs the previous and new values, reason, and editor in the audit trail", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);

    await editFundraisingEntry("entry-1", formData(VALID_FIELDS));

    expect(mp.fundraisingEntryEdit.create).toHaveBeenCalledWith({
      data: {
        entryId: "entry-1",
        previousAmount: 100,
        newAmount: 10,
        previousDescription: "Candy sale",
        newDescription: "Candy sale",
        reason: "Typo — entered $100 instead of $10",
        editedBy: "admin@school.org",
      },
    });
  });

  it("updates the entry's amount and description", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);

    await editFundraisingEntry("entry-1", formData(VALID_FIELDS));

    expect(mp.fundraisingEntry.update).toHaveBeenCalledWith({
      where: { id: "entry-1" },
      data: { amount: 10, description: "Candy sale" },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runBackupNow() / saveBackupConfig()
// ─────────────────────────────────────────────────────────────────────────────

describe("runBackupNow()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns Unauthorized for a role without settings permission", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(treasurerSession as never);
    expect(await runBackupNow()).toEqual({ error: "Unauthorized" });
    expect(runBackup).not.toHaveBeenCalled();
  });

  it("allows PRESIDENT (not just ADMIN)", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(presidentSession as never);
    const result = await runBackupNow();
    expect(result).toEqual({ success: true, filename: "moneyfinder-test.sql.gz" });
  });

  it("forces the backup regardless of schedule state", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    await runBackupNow();
    expect(runBackup).toHaveBeenCalledWith({ force: true });
  });

  it("returns an error when the backup fails", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    vi.mocked(runBackup).mockResolvedValueOnce({ success: false, error: "pg_dump exited with code 1" });
    const result = await runBackupNow();
    expect(result).toEqual({ error: "pg_dump exited with code 1" });
  });
});

describe("saveBackupConfig()", () => {
  beforeEach(() => vi.clearAllMocks());

  function formData(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  const VALID_FIELDS = { destinationPath: "/mnt/backup", frequencyHours: "24", retentionCount: "30" };

  it("returns Unauthorized for a role without settings permission", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(treasurerSession as never);
    const result = await saveBackupConfig({}, formData(VALID_FIELDS));
    expect(result).toEqual({ error: "Unauthorized" });
    expect(saveBackupSchedule).not.toHaveBeenCalled();
  });

  it("requires a destination path", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    const result = await saveBackupConfig({}, formData({ ...VALID_FIELDS, destinationPath: "" }));
    expect(result.error).toMatch(/destination path/i);
  });

  it("rejects a non-positive frequency", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
    const result = await saveBackupConfig({}, formData({ ...VALID_FIELDS, frequencyHours: "0" }));
    expect(result.error).toMatch(/frequency/i);
  });

  it("saves the parsed config, defaulting scheduleEnabled to false when unchecked", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(presidentSession as never);

    const result = await saveBackupConfig({}, formData(VALID_FIELDS));

    expect(saveBackupSchedule).toHaveBeenCalledWith({
      destinationPath: "/mnt/backup",
      scheduleEnabled: false,
      frequencyHours: 24,
      retentionCount: 30,
    });
    expect(result).toEqual({ success: true });
  });

  it("saves scheduleEnabled true when the checkbox is checked", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);

    const fd = formData(VALID_FIELDS);
    fd.set("scheduleEnabled", "on");
    await saveBackupConfig({}, fd);

    expect(saveBackupSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleEnabled: true }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// submitFundRequest() — graduated-account check
// ─────────────────────────────────────────────────────────────────────────────

describe("submitFundRequest() graduated check", () => {
  function formData(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }
  const VALID_FIELDS = { studentId: "student-1", description: "Field trip fee", amount: "45" };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentSession).mockResolvedValue(parentSession as never);
    mp.parentProfile.findUnique.mockResolvedValue({ id: "profile-1" } as never);
    mp.fundRequest.create.mockResolvedValue({} as never);
  });

  it("rejects when the student has graduated", async () => {
    mp.student.findUnique.mockResolvedValue({ id: "student-1", profileId: "profile-1", graduated: true } as never);

    const result = await submitFundRequest({}, formData(VALID_FIELDS));

    expect(result.error).toMatch(/graduated/i);
    expect(mp.fundRequest.create).not.toHaveBeenCalled();
  });

  it("allows the request when the student has not graduated", async () => {
    mp.student.findUnique.mockResolvedValue({ id: "student-1", profileId: "profile-1", graduated: false } as never);

    const result = await submitFundRequest({}, formData(VALID_FIELDS));

    expect(result).toEqual({ success: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// approveFundRequest() — graduated-account check
// ─────────────────────────────────────────────────────────────────────────────

describe("approveFundRequest() graduated check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentSession).mockResolvedValue(treasurerSession as never);
    mp.$transaction.mockResolvedValue([{}, {}] as never);
  });

  it("rejects approval when the student has since graduated", async () => {
    mp.fundRequest.findUnique.mockResolvedValue({
      id: "req-1",
      status: "PENDING",
      student: { graduated: true },
    } as never);

    const result = await approveFundRequest("req-1");

    expect(result.error).toMatch(/graduated/i);
    expect(mp.$transaction).not.toHaveBeenCalled();
  });

  it("allows approval when the student has not graduated", async () => {
    mp.fundRequest.findUnique.mockResolvedValue({
      id: "req-1",
      status: "PENDING",
      studentId: "student-1",
      amount: 45,
      description: "Field trip",
      student: { id: "student-1", graduated: false, profile: null },
    } as never);

    const result = await approveFundRequest("req-1");

    expect(result).toEqual({ success: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// transferGraduatedBalance()
// ─────────────────────────────────────────────────────────────────────────────

describe("transferGraduatedBalance()", () => {
  const GRADUATED_SENIOR = {
    id: "senior-1",
    firstName: "Alice",
    lastName: "Doe",
    profileId: "profile-1",
    graduated: true,
    transferApproved: false,
    fundraising: [{ amount: 100 }],
    expenses: [{ amount: 40 }],
  };
  const SIBLING = {
    id: "sibling-1",
    firstName: "Bob",
    lastName: "Doe",
    profileId: "profile-1",
    graduated: false,
  };

  function mockStudents(from: unknown, to: unknown) {
    mp.student.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => {
      if (where.id === "senior-1") return from;
      if (where.id === "sibling-1") return to;
      return null;
    }) as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentSession).mockResolvedValue(treasurerSession as never);
    mockStudents(GRADUATED_SENIOR, SIBLING);
    mp.$transaction.mockResolvedValue([{}, {}, {}] as never);
  });

  it("returns Unauthorized for a role without admin/fundRequests permission", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(parentSession as never);
    expect(await transferGraduatedBalance("senior-1", "sibling-1")).toEqual({ error: "Unauthorized" });
  });

  it("returns an error when the source student doesn't exist", async () => {
    mockStudents(null, SIBLING);
    const result = await transferGraduatedBalance("senior-1", "sibling-1");
    expect(result).toEqual({ error: "Student not found" });
  });

  it("returns an error when the source student hasn't graduated", async () => {
    mockStudents({ ...GRADUATED_SENIOR, graduated: false }, SIBLING);
    const result = await transferGraduatedBalance("senior-1", "sibling-1");
    expect(result.error).toMatch(/has not graduated/i);
  });

  it("returns an error when the transfer was already approved", async () => {
    mockStudents({ ...GRADUATED_SENIOR, transferApproved: true }, SIBLING);
    const result = await transferGraduatedBalance("senior-1", "sibling-1");
    expect(result.error).toMatch(/already approved/i);
  });

  it("returns an error when the destination student doesn't exist", async () => {
    mockStudents(GRADUATED_SENIOR, null);
    const result = await transferGraduatedBalance("senior-1", "sibling-1");
    expect(result).toEqual({ error: "Destination student not found" });
  });

  it("returns an error when the destination student belongs to a different parent", async () => {
    mockStudents(GRADUATED_SENIOR, { ...SIBLING, profileId: "profile-2" });
    const result = await transferGraduatedBalance("senior-1", "sibling-1");
    expect(result.error).toMatch(/same parent/i);
  });

  it("returns an error when the destination student has also graduated", async () => {
    mockStudents(GRADUATED_SENIOR, { ...SIBLING, graduated: true });
    const result = await transferGraduatedBalance("senior-1", "sibling-1");
    expect(result.error).toMatch(/cannot transfer to a graduated student/i);
  });

  it("returns an error when there is no remaining balance", async () => {
    mockStudents({ ...GRADUATED_SENIOR, fundraising: [{ amount: 40 }], expenses: [{ amount: 40 }] }, SIBLING);
    const result = await transferGraduatedBalance("senior-1", "sibling-1");
    expect(result.error).toMatch(/no remaining balance/i);
  });

  it("transfers the full remaining balance and marks the transfer approved", async () => {
    const result = await transferGraduatedBalance("senior-1", "sibling-1");

    expect(result).toEqual({ success: true, amount: 60 });
    expect(mp.expenseEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ studentId: "senior-1", amount: 60, description: expect.stringContaining("Bob Doe") }),
      }),
    );
    expect(mp.fundraisingEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ studentId: "sibling-1", amount: 60, description: expect.stringContaining("Alice Doe") }),
      }),
    );
    expect(mp.student.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "senior-1" },
        data: expect.objectContaining({
          transferApproved: true,
          transferApprovedBy: "treasurer@school.org",
        }),
      }),
    );
  });
});
