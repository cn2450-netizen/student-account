"use server";

import { revalidatePath } from "next/cache";
import { hash, compare } from "bcryptjs";
import { z } from "zod";

import { randomBytes, createHash } from "crypto";

import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { sendDepositReceipt, sendAccountApprovedEmail, sendWithdrawReceipt, sendFundRequestDecisionEmail, sendPasswordResetEmail, sendStaffInviteEmail, resendReceiptEmail as resendReceiptEmailInternal } from "@/lib/email";
import { runBackup, saveBackupSchedule } from "@/lib/backup";
import { runGradeAdvancement } from "@/lib/gradeAdvancement";

// ─── Change password on first login ─────────────────────────────────────────

const ChangePasswordSchema = z
  .object({
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function changePasswordOnFirstLogin(
  _prev: { error?: string; success?: boolean },
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user) return { error: "Not authenticated" };

  const parsed = ChangePasswordSchema.safeParse({
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const passwordHash = await hash(parsed.data.newPassword, 12);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash, forcePasswordChange: false, passwordChangedAt: new Date() },
  });

  return { success: true };
}

// ─── Register parent account (public — no auth required) ────────────────────

const RegisterSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(7, "Phone number is required"),
  email: z.string().trim().email("Valid email is required"),
});

export async function registerParentAccount(
  _prev: { error?: string; success?: boolean },
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = RegisterSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { firstName, lastName, phone, email } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  // Check for an existing request or live user account
  const existingRequest = await prisma.accountRequest.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingRequest) {
    if (existingRequest.status === "PENDING") {
      return { error: "A request for this email is already pending review." };
    }
    if (existingRequest.status === "APPROVED") {
      // Make sure the user account actually still exists before blocking
      const existingUser = await prisma.user.findUnique({ where: { username: normalizedEmail } });
      if (existingUser) {
        return { error: "An account with this email already exists. Please log in." };
      }
    }
    // REJECTED or APPROVED-but-user-deleted — clear the old request and allow re-submission
    await prisma.accountRequest.delete({ where: { id: existingRequest.id } });
  } else {
    const existingUser = await prisma.user.findUnique({ where: { username: normalizedEmail } });
    if (existingUser) {
      return { error: "An account with this email already exists. Please log in." };
    }
  }

  await prisma.accountRequest.create({
    data: { firstName, lastName, phone, email: normalizedEmail },
  });

  return { success: true };
}

// ─── Forgot password (public — no auth required) ────────────────────────────

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const RESET_REQUEST_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes — avoid spamming the inbox on repeat submits

// Issues a single-use password-reset token for a user and returns the link to email them.
// Shared by requestPasswordReset() (self-service) and approveAccountRequest() (admin approval).
async function createPasswordResetLink(userId: string): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  await prisma.passwordResetToken.create({
    data: { userId, tokenHash, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "";
  return `${baseUrl}/reset-password?token=${rawToken}`;
}

export async function requestPasswordReset(
  _prev: { success?: boolean },
  formData: FormData,
): Promise<{ success?: boolean }> {
  const email = (formData.get("email") as string | null)?.toLowerCase().trim();

  if (email) {
    const user = await prisma.user.findUnique({ where: { username: email } });
    if (user) {
      const recent = await prisma.passwordResetToken.findFirst({
        where: { userId: user.id, createdAt: { gt: new Date(Date.now() - RESET_REQUEST_COOLDOWN_MS) } },
      });

      if (!recent) {
        const resetUrl = await createPasswordResetLink(user.id);
        try {
          await sendPasswordResetEmail({ to: user.username, resetUrl });
        } catch { /* never reveal send failures to the requester */ }
      }
    }
  }

  // Same response whether or not the email exists — don't leak account existence.
  return { success: true };
}

const ResetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function resetPasswordWithToken(
  _prev: { error?: string; success?: boolean },
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const parsed = ResetPasswordSchema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return { error: "This reset link is invalid or has expired. Request a new one." };
  }

  const passwordHash = await hash(parsed.data.newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash,
        forcePasswordChange: false,
        passwordChangedAt: new Date(),
        loginAttempts: 0,
        loginWindowStart: null,
        lockedUntil: null,
        permanentLock: false,
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return { success: true };
}

// ─── Approve account request (admin only) ───────────────────────────────────

export async function approveAccountRequest(requestId: string) {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "approvals")) {
    return { error: "Unauthorized" };
  }

  const request = await prisma.accountRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status !== "PENDING") {
    return { error: "Request not found or already processed" };
  }

  // No password is collected at signup anymore — set an unusable random
  // placeholder; the parent sets their real password via the emailed link below.
  const passwordHash = await hash(randomBytes(24).toString("hex"), 12);

  const userId = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: request.email,
        passwordHash,
        role: "PARENT",
        forcePasswordChange: true,
      },
    });

    await tx.parentProfile.create({
      data: {
        userId: user.id,
        firstName: request.firstName,
        lastName: request.lastName,
        phone: request.phone,
      },
    });

    await tx.accountRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        reviewedBy: session.user.name,
        reviewedAt: new Date(),
      },
    });

    return user.id;
  });

  revalidatePath("/admin/approvals");

  let emailSent = false;
  try {
    const resetUrl = await createPasswordResetLink(userId);
    emailSent = await sendAccountApprovedEmail({
      to: request.email,
      parentName: `${request.firstName} ${request.lastName}`,
      resetUrl,
    });
  } catch { /* email failure must not fail the approval */ }

  return { success: true, emailSent, parentEmail: request.email };
}

// ─── Reject account request (admin only) ────────────────────────────────────

export async function rejectAccountRequest(requestId: string) {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "approvals")) {
    return { error: "Unauthorized" };
  }

  await prisma.accountRequest.update({
    where: { id: requestId },
    data: {
      status: "REJECTED",
      reviewedBy: session.user.name,
      reviewedAt: new Date(),
    },
  });

  revalidatePath("/admin/approvals");
  return { success: true };
}

// ─── Assign request to reviewer (admin only) ────────────────────────────────

export async function assignAccountRequest(requestId: string, assign: boolean) {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "approvals")) {
    return { error: "Unauthorized" };
  }

  await prisma.accountRequest.update({
    where: { id: requestId },
    data: { assignedTo: assign ? session.user.name : null },
  });

  revalidatePath("/admin/approvals");
  return { success: true };
}

// ─── Delete parent account (admin only) ─────────────────────────────────────

export async function deleteParentAccount(userId: string) {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "admin")) {
    return { error: "Unauthorized" };
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user || user.role !== "PARENT") {
    return { error: "Account not found" };
  }

  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/parents");
  return { success: true };
}

// ─── Create student (parent) ─────────────────────────────────────────────────

const StudentSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  grade: z
    .string()
    .min(1, "Grade is required")
    .refine(
      (value) => ["8", "9", "10", "11", "12"].includes(value),
      { message: "Grade must be between 8 and 12" },
    ),
});

export async function createStudent(
  _prev: { error?: string; success?: boolean },
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user) return { error: "Not authenticated" };

  const parsed = StudentSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    grade: formData.get("grade") as string,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const profile = await prisma.parentProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) return { error: "Parent profile not found" };

  await prisma.student.create({
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      grade: parsed.data.grade,
      profileId: profile.id,
    },
  });

  revalidatePath("/students");
  return { success: true };
}

// ─── Add fundraising entry ────────────────────────────────────────────────────

const EntrySchema = z.object({
  studentId: z.string().min(1),
  amount: z.coerce.number().positive("Amount must be positive"),
  description: z.string().min(1, "Description is required"),
  date: z.string().optional(),
});

export async function addFundraisingEntry(
  _prev: { error?: string; success?: boolean },
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user) return { error: "Not authenticated" };

  const parsed = EntrySchema.safeParse({
    studentId: formData.get("studentId"),
    amount: formData.get("amount"),
    description: formData.get("description"),
    date: formData.get("date") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Only manageFundraising roles (admin, fundraising manager) or parents (own students) may add entries
  if (!can(session.user.role, "manageFundraising") && !can(session.user.role, "ownFunds")) {
    return { error: "Unauthorized" };
  }

  const student = await prisma.student.findUnique({
    where: { id: parsed.data.studentId },
    include: { profile: { include: { user: { select: { username: true } } } } },
  });
  if (!student) return { error: "Student not found" };

  // Verify the student belongs to this parent (unless fundraising manager)
  if (!can(session.user.role, "manageFundraising")) {
    const profile = await prisma.parentProfile.findUnique({
      where: { userId: session.user.id },
    });
    if (!profile || student.profileId !== profile.id) {
      return { error: "Student not found" };
    }
  }

  if (student.graduated) {
    return { error: "This student has graduated — deposits can no longer be added to their account" };
  }

  const entryDate = parsed.data.date ? new Date(parsed.data.date) : new Date();

  await prisma.fundraisingEntry.create({
    data: {
      studentId: parsed.data.studentId,
      amount: parsed.data.amount,
      description: parsed.data.description,
      date: entryDate,
    },
  });

  // Send deposit receipt to the student's parent
  try {
    if (student.profile) {
      await sendDepositReceipt({
        to: student.profile.user.username,
        parentName: `${student.profile.firstName} ${student.profile.lastName}`,
        studentName: `${student.firstName} ${student.lastName}`,
        studentId: student.id,
        amount: Number(parsed.data.amount).toFixed(2),
        description: parsed.data.description,
        date: entryDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      });
    }
  } catch { /* email failure must not fail the fund entry */ }

  revalidatePath("/fundraising");
  return { success: true };
}

// ─── Correct a fundraising entry (audit-logged) ──────────────────────────────

const EditEntrySchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  description: z.string().min(1, "Description is required"),
  reason: z.string().min(1, "A reason is required for the correction"),
});

export async function editFundraisingEntry(
  entryId: string,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "manageFundraising")) return { error: "Unauthorized" };

  const parsed = EditEntrySchema.safeParse({
    amount: formData.get("amount"),
    description: formData.get("description"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const entry = await prisma.fundraisingEntry.findUnique({ where: { id: entryId } });
  if (!entry) return { error: "Entry not found" };

  const { amount, description, reason } = parsed.data;

  await prisma.$transaction([
    prisma.fundraisingEntryEdit.create({
      data: {
        entryId,
        previousAmount: entry.amount,
        newAmount: amount,
        previousDescription: entry.description,
        newDescription: description,
        reason: reason.trim(),
        editedBy: session.user.name,
      },
    }),
    prisma.fundraisingEntry.update({
      where: { id: entryId },
      data: { amount, description },
    }),
  ]);

  revalidatePath("/admin/fundraising");
  revalidatePath("/fundraising");
  revalidatePath("/settings/fundraising-audit");
  revalidatePath("/dashboard");
  return { success: true };
}

// ─── Add expense entry ────────────────────────────────────────────────────────

export async function addExpenseEntry(
  _prev: { error?: string; success?: boolean },
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user) return { error: "Not authenticated" };

  const parsed = EntrySchema.safeParse({
    studentId: formData.get("studentId"),
    amount: formData.get("amount"),
    description: formData.get("description"),
    date: formData.get("date") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  if (!can(session.user.role, "allFunds")) {
    const profile = await prisma.parentProfile.findUnique({
      where: { userId: session.user.id },
    });
    if (!profile) return { error: "Profile not found" };

    const student = await prisma.student.findUnique({
      where: { id: parsed.data.studentId },
    });
    if (!student || student.profileId !== profile.id) {
      return { error: "Student not found" };
    }
  }

  const entryDate = parsed.data.date ? new Date(parsed.data.date) : new Date();

  await prisma.expenseEntry.create({
    data: {
      studentId: parsed.data.studentId,
      amount: parsed.data.amount,
      description: parsed.data.description,
      date: entryDate,
    },
  });

  // Send withdrawal notification to the student's parent (if enabled in settings)
  try {
    const student = await prisma.student.findUnique({
      where: { id: parsed.data.studentId },
      include: { profile: { include: { user: { select: { username: true } } } } },
    });
    if (student?.profile) {
      await sendWithdrawReceipt({
        to: student.profile.user.username,
        parentName: `${student.profile.firstName} ${student.profile.lastName}`,
        studentName: `${student.firstName} ${student.lastName}`,
        studentId: student.id,
        amount: Number(parsed.data.amount).toFixed(2),
        description: parsed.data.description,
        date: entryDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      });
    }
  } catch { /* email failure must not fail the expense entry */ }

  revalidatePath("/expenses");
  return { success: true };
}

// ─── Delete student ───────────────────────────────────────────────────────────

export async function deleteStudent(studentId: string) {
  const session = await getCurrentSession();
  if (!session?.user) return { error: "Not authenticated" };

  if (!can(session.user.role, "allStudents")) {
    const profile = await prisma.parentProfile.findUnique({
      where: { userId: session.user.id },
    });
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!profile || !student || student.profileId !== profile.id) {
      return { error: "Unauthorized" };
    }
  }

  await prisma.student.delete({ where: { id: studentId } });
  revalidatePath("/students");
  return { success: true };
}

// ─── Change my password ───────────────────────────────────────────────────────

export async function changeMyPassword(
  _prev: { error?: string; success?: boolean },
  formData: FormData,
) {
  const session = await getCurrentSession();
  if (!session?.user) return { error: "Not authenticated" };

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword.length < 8) return { error: "Password must be at least 8 characters" };
  if (newPassword !== confirmPassword) return { error: "Passwords do not match" };

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { error: "User not found" };

  const ok = await compare(currentPassword, user.passwordHash);
  if (!ok) return { error: "Current password is incorrect" };

  const passwordHash = await hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordChangedAt: new Date() },
  });

  return { success: true };
}

// ─── Admin: reset another user's password ───────────────────────────────────

export async function resetUserPassword(userId: string): Promise<{ error?: string; success?: boolean; emailSent?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "admin")) return { error: "Unauthorized" };

  // Don't allow resetting your own password through this path
  if (userId === session.user.id) return { error: "Use the change password form to update your own password" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true },
  });
  if (!user) return { error: "User not found" };

  // Invalidate the current password with an unusable random placeholder —
  // the user sets their real password via the emailed reset link below.
  const passwordHash = await hash(randomBytes(24).toString("hex"), 12);
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      forcePasswordChange: true,
      loginAttempts: 0,
      loginWindowStart: null,
      lockedUntil: null,
      permanentLock: false,
    },
  });

  let emailSent = false;
  try {
    const resetUrl = await createPasswordResetLink(user.id);
    emailSent = await sendPasswordResetEmail({ to: user.username, resetUrl });
  } catch { /* email failure must not fail the reset */ }

  return { success: true, emailSent };
}

// ─── Admin: delete user ───────────────────────────────────────────────────────

export async function deleteUser(userId: string): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "admin")) return { error: "Unauthorized" };

  if (userId === session.user.id) return { error: "Cannot delete your own account" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true },
  });
  if (!user) return { error: "User not found" };

  // Delete the user and also remove the AccountRequest so the email can be reused
  await prisma.$transaction([
    prisma.accountRequest.deleteMany({ where: { email: user.username } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  revalidatePath("/settings/users");
  return { success: true };
}

// ─── Admin: update user role (PARENT ↔ TREASURER only) ───────────────────────

// ─── Admin: create a staff user (ADMIN or TREASURER) ───────────────────────

const CreateStaffUserSchema = z.object({
  username: z.string().trim().email("A valid email address is required"),
  role: z.enum(["ADMIN", "PRESIDENT", "TREASURER", "FUNDRAISING_MANAGER", "BOARD_MEMBER"]),
});

export async function createStaffUser(
  _prev: { error?: string; success?: boolean; emailSent?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean; emailSent?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "admin")) return { error: "Unauthorized" };

  const parsed = CreateStaffUserSchema.safeParse({
    username: formData.get("username"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { role } = parsed.data;
  const username = parsed.data.username.toLowerCase().trim();

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return { error: "A user with that username already exists" };

  // Only one TREASURER allowed at a time
  if (role === "TREASURER") {
    const existing = await prisma.user.findFirst({ where: { role: "TREASURER" } });
    if (existing) return { error: `A Treasurer account already exists (${existing.username}). Delete it before creating a new one.` };
  }

  // No password is collected here — set an unusable random placeholder;
  // the new staff member sets their real password via the emailed link below.
  const passwordHash = await hash(randomBytes(24).toString("hex"), 12);
  const user = await prisma.user.create({
    data: { username, passwordHash, role, forcePasswordChange: true },
  });

  revalidatePath("/settings/users");

  let emailSent = false;
  try {
    const resetUrl = await createPasswordResetLink(user.id);
    emailSent = await sendStaffInviteEmail({ to: username, resetUrl });
  } catch { /* email failure must not fail the account creation */ }

  return { success: true, emailSent };
}

// ─── President/Admin: change a staff account's email address ────────────────

const UpdateStaffEmailSchema = z.object({
  email: z.string().trim().email("A valid email address is required"),
});

export async function updateStaffEmail(
  userId: string,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "manageStaffAccounts")) return { error: "Unauthorized" };

  const parsed = UpdateStaffEmailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const newUsername = parsed.data.email.toLowerCase().trim();

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user) return { error: "User not found" };
  if (user.role === "PARENT") return { error: "This action is only for staff accounts, not parent accounts" };

  const exists = await prisma.user.findUnique({ where: { username: newUsername } });
  if (exists && exists.id !== userId) return { error: "A user with that email already exists" };

  await prisma.user.update({ where: { id: userId }, data: { username: newUsername } });

  revalidatePath("/settings/users");
  return { success: true };
}

// ─── Parent: submit a fund request ───────────────────────────────────────────

const FundRequestSchema = z.object({
  studentId: z.string().min(1, "Please select a student"),
  description: z.string().min(3, "Please describe what the funds will be used for"),
  amount: z.coerce.number().positive("Amount must be positive"),
});

export async function submitFundRequest(
  _prev: { error?: string; success?: boolean },
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "submitRequests")) return { error: "Unauthorized" };

  const parsed = FundRequestSchema.safeParse({
    studentId: formData.get("studentId"),
    description: formData.get("description"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  // Verify the student belongs to this parent
  const profile = await prisma.parentProfile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return { error: "Parent profile not found" };

  const student = await prisma.student.findUnique({ where: { id: parsed.data.studentId } });
  if (!student || student.profileId !== profile.id) return { error: "Student not found" };
  if (student.graduated) {
    return { error: "This student has graduated — fund requests can no longer be submitted for their account" };
  }

  await prisma.fundRequest.create({
    data: {
      studentId: parsed.data.studentId,
      description: parsed.data.description,
      amount: parsed.data.amount,
    },
  });

  revalidatePath("/request-funds");
  return { success: true };
}

// ─── Treasurer: approve a fund request ───────────────────────────────────────

export async function approveFundRequest(
  requestId: string,
  notes?: string,
): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "fundRequests")) return { error: "Unauthorized" };

  const req = await prisma.fundRequest.findUnique({
    where: { id: requestId },
    include: { student: { include: { profile: { include: { user: { select: { username: true } } } } } } },
  });
  if (!req || req.status !== "PENDING") return { error: "Request not found or already processed" };
  if (req.student.graduated) {
    return { error: "This student has graduated — the request can no longer be approved" };
  }

  const approvedAt = new Date();

  await prisma.$transaction([
    prisma.fundRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        notes: notes ?? null,
        reviewedBy: session.user.name,
        reviewedAt: approvedAt,
      },
    }),
    // Automatically create an expense entry when approved
    prisma.expenseEntry.create({
      data: {
        studentId: req.studentId,
        description: req.description,
        amount: req.amount,
        date: approvedAt,
      },
    }),
  ]);

  try {
    if (req.student.profile) {
      await sendWithdrawReceipt({
        to: req.student.profile.user.username,
        parentName: `${req.student.profile.firstName} ${req.student.profile.lastName}`,
        studentName: `${req.student.firstName} ${req.student.lastName}`,
        studentId: req.student.id,
        amount: Number(req.amount).toFixed(2),
        description: req.description,
        date: approvedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      });
    }
  } catch { /* email failure must not fail the approval */ }

  revalidatePath("/admin/fund-requests");
  return { success: true };
}

// ─── Resend a receipt email ──────────────────────────────────────────────────

export async function resendReceiptEmail(
  receiptId: string,
): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user || (!can(session.user.role, "fundRequests") && !can(session.user.role, "allFunds"))) {
    return { error: "Unauthorized" };
  }

  const result = await resendReceiptEmailInternal(receiptId);
  if (!result.success) return { error: result.error ?? "Failed to resend email" };

  revalidatePath("/admin/receipts");
  return { success: true };
}

// ─── Treasurer: deny a fund request ──────────────────────────────────────────

export async function denyFundRequest(
  requestId: string,
  notes: string,
): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "fundRequests")) return { error: "Unauthorized" };

  const req = await prisma.fundRequest.findUnique({
    where: { id: requestId },
    include: { student: { include: { profile: { include: { user: { select: { username: true } } } } } } },
  });
  if (!req || req.status !== "PENDING") return { error: "Request not found or already processed" };

  const denialReason = notes?.trim();
  if (!denialReason) return { error: "A reason is required when denying a request" };

  const deniedAt = new Date();

  await prisma.fundRequest.update({
    where: { id: requestId },
    data: {
      status: "DENIED",
      notes: denialReason,
      reviewedBy: session.user.name,
      reviewedAt: deniedAt,
    },
  });

  try {
    if (req.student.profile) {
      await sendFundRequestDecisionEmail({
        to: req.student.profile.user.username,
        parentName: `${req.student.profile.firstName} ${req.student.profile.lastName}`,
        studentName: `${req.student.firstName} ${req.student.lastName}`,
        studentId: req.student.id,
        amount: Number(req.amount).toFixed(2),
        reason: denialReason,
        status: "DENIED",
        date: deniedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      });
    }
  } catch { /* email failure must not fail the denial */ }

  revalidatePath("/admin/fund-requests");
  return { success: true };
}

// ─── Fundraiser vendor management ─────────────────────────────────────────────

const FundraiserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
});

export async function createFundraiser(
  _prev: { error?: string; success?: boolean },
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "manageFundraising")) return { error: "Unauthorized" };

  const parsed = FundraiserSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const exists = await prisma.fundraiser.findFirst({ where: { name: { equals: parsed.data.name, mode: "insensitive" } } });
  if (exists) return { error: "A fundraiser with that name already exists" };

  await prisma.fundraiser.create({ data: parsed.data });
  revalidatePath("/admin/fundraisers");
  return { success: true };
}

export async function deleteFundraiser(fundraiserId: string): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "manageFundraising")) return { error: "Unauthorized" };

  await prisma.fundraiser.delete({ where: { id: fundraiserId } });
  revalidatePath("/admin/fundraisers");
  return { success: true };
}

export async function toggleFundraiser(fundraiserId: string, active: boolean): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "manageFundraising")) return { error: "Unauthorized" };

  await prisma.fundraiser.update({ where: { id: fundraiserId }, data: { active } });
  revalidatePath("/admin/fundraisers");
  revalidatePath("/admin/fundraising");
  return { success: true };
}

// ─── Grade advancement (admin / treasurer) ───────────────────────────────────
// Advances every active student's numeric grade by 1 on or after July 1.
// Grade-12 students are marked as graduated instead of moving to grade 13.
// Stores the advancement year in AppConfig to prevent double-running.

export async function advanceGrades(
  force = false,
): Promise<{ error?: string; advanced?: number; graduated?: number; skipped?: string }> {
  const session = await getCurrentSession();
  if (!session?.user || (!can(session.user.role, "admin") && !can(session.user.role, "fundRequests"))) {
    return { error: "Unauthorized" };
  }

  const { advanced, graduated, skipped } = await runGradeAdvancement({ force });
  if (skipped) return { skipped };

  revalidatePath("/admin/students");
  revalidatePath("/admin/graduated");
  return { advanced, graduated };
}

// ─── Approve graduation transfer (treasurer / admin) ─────────────────────────

export async function approveGraduationTransfer(
  studentId: string,
  notes?: string,
): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user || (!can(session.user.role, "admin") && !can(session.user.role, "fundRequests"))) {
    return { error: "Unauthorized" };
  }

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) return { error: "Student not found" };
  if (!student.graduated) return { error: "Student has not graduated" };
  if (student.transferApproved) return { error: "Transfer already approved" };

  await prisma.student.update({
    where: { id: studentId },
    data: {
      transferApproved: true,
      transferApprovedAt: new Date(),
      transferApprovedBy: session.user.name,
      transferNotes: notes?.trim() || null,
    },
  });

  revalidatePath("/admin/graduated");
  return { success: true };
}

// ─── Transfer a graduated student's balance to a sibling (treasurer / admin) ─

export async function transferGraduatedBalance(
  fromStudentId: string,
  toStudentId: string,
): Promise<{ error?: string; success?: boolean; amount?: number }> {
  const session = await getCurrentSession();
  if (!session?.user || (!can(session.user.role, "admin") && !can(session.user.role, "fundRequests"))) {
    return { error: "Unauthorized" };
  }

  const fromStudent = await prisma.student.findUnique({
    where: { id: fromStudentId },
    include: {
      fundraising: { select: { amount: true } },
      expenses: { select: { amount: true } },
    },
  });
  if (!fromStudent) return { error: "Student not found" };
  if (!fromStudent.graduated) return { error: "Student has not graduated" };
  if (fromStudent.transferApproved) return { error: "Transfer already approved" };

  const toStudent = await prisma.student.findUnique({ where: { id: toStudentId } });
  if (!toStudent) return { error: "Destination student not found" };
  if (toStudent.profileId !== fromStudent.profileId) {
    return { error: "Destination student must belong to the same parent" };
  }
  if (toStudent.graduated) return { error: "Cannot transfer to a graduated student" };

  const raised = fromStudent.fundraising.reduce((sum, e) => sum + Number(e.amount), 0);
  const spent = fromStudent.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const balance = raised - spent;
  if (balance <= 0) return { error: "This account has no remaining balance to transfer" };

  const now = new Date();
  const fromName = `${fromStudent.firstName} ${fromStudent.lastName}`;
  const toName = `${toStudent.firstName} ${toStudent.lastName}`;

  await prisma.$transaction([
    prisma.expenseEntry.create({
      data: {
        studentId: fromStudentId,
        amount: balance,
        description: `Balance transferred to ${toName}`,
        date: now,
      },
    }),
    prisma.fundraisingEntry.create({
      data: {
        studentId: toStudentId,
        amount: balance,
        description: `Balance transferred from ${fromName}`,
        date: now,
      },
    }),
    prisma.student.update({
      where: { id: fromStudentId },
      data: {
        transferApproved: true,
        transferApprovedAt: now,
        transferApprovedBy: session.user.name,
        transferNotes: `Transferred $${balance.toFixed(2)} to ${toName}`,
      },
    }),
  ]);

  revalidatePath("/admin/graduated");
  revalidatePath("/admin/fundraising");
  revalidatePath("/admin/expenses");
  revalidatePath("/students");
  return { success: true, amount: balance };
}

// ─── President / Admin: unlock permanently locked account ────────────────────

export async function unlockAccount(
  userId: string,
): Promise<{ error?: string; success?: boolean; emailSent?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "unlockAccounts")) return { error: "Unauthorized" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, permanentLock: true },
  });
  if (!user) return { error: "User not found" };
  if (!user.permanentLock) return { error: "Account is not permanently locked" };

  // A permanent lock only follows 15 wrong-password attempts — the account
  // owner almost certainly doesn't have a working password to log back in
  // with. Invalidate it and email a reset link instead of just lifting the
  // lock, same as every other password-recovery path.
  const passwordHash = await hash(randomBytes(24).toString("hex"), 12);
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      permanentLock: false,
      forcePasswordChange: true,
      lockoutCount: 0,
      loginAttempts: 0,
      loginWindowStart: null,
      lockedUntil: null,
    },
  });

  revalidatePath("/admin/locked-accounts");

  let emailSent = false;
  try {
    const resetUrl = await createPasswordResetLink(user.id);
    emailSent = await sendPasswordResetEmail({ to: user.username, resetUrl });
  } catch { /* email failure must not fail the unlock */ }

  return { success: true, emailSent };
}

// ─── President/Admin: database backups ───────────────────────────────────────

export async function runBackupNow(): Promise<{ error?: string; success?: boolean; filename?: string }> {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "settings")) return { error: "Unauthorized" };

  const result = await runBackup({ force: true });
  revalidatePath("/settings/backups");

  if (!result.success) return { error: result.error ?? "Backup failed" };
  return { success: true, filename: result.filename };
}

const BackupScheduleSchema = z.object({
  destinationPath: z.string().min(1, "Destination path is required"),
  scheduleEnabled: z.boolean(),
  frequencyHours: z.coerce.number().positive("Frequency must be a positive number of hours"),
  retentionCount: z.coerce.number().int().positive("Retention must be a positive whole number"),
});

export async function saveBackupConfig(
  _prev: { error?: string; success?: boolean },
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "settings")) return { error: "Unauthorized" };

  const parsed = BackupScheduleSchema.safeParse({
    destinationPath: formData.get("destinationPath"),
    scheduleEnabled: formData.get("scheduleEnabled") === "on",
    frequencyHours: formData.get("frequencyHours"),
    retentionCount: formData.get("retentionCount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  await saveBackupSchedule(parsed.data);
  revalidatePath("/settings/backups");
  return { success: true };
}
