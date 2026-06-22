"use server";

import { revalidatePath } from "next/cache";
import { hash, compare } from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { sendDepositReceipt, sendApprovalEmail } from "@/lib/email";

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

const RegisterSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    phone: z.string().min(7, "Phone number is required"),
    email: z.string().email("Valid email is required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
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
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { firstName, lastName, phone, email, password } = parsed.data;
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
    data: {
      firstName,
      lastName,
      phone,
      email: normalizedEmail,
      passwordHash: await hash(password, 12),
    },
  });

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

  // Use the password the parent set at registration, or fall back to a temp password
  const passwordHash = request.passwordHash ?? await hash(request.email, 12);
  const forcePasswordChange = !request.passwordHash;

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: request.email,
        passwordHash,
        role: "PARENT",
        forcePasswordChange,
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
  });

  revalidatePath("/admin/approvals");

  const loginUrl = process.env.NEXTAUTH_URL ?? "";
  let emailSent = false;
  try {
    emailSent = await sendApprovalEmail({
      to: request.email,
      parentName: `${request.firstName} ${request.lastName}`,
      loginUrl,
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
    .optional()
    .refine(
      (value) => !value || ["8", "9", "10", "11", "12"].includes(value),
      {
        message: "Grade must be 8, 9, 10, 11, or 12",
      },
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
    grade: formData.get("grade") || undefined,
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

  // Verify the student belongs to this parent (unless fundraising manager)
  if (!can(session.user.role, "manageFundraising")) {
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
    const student = await prisma.student.findUnique({
      where: { id: parsed.data.studentId },
      include: { profile: { include: { user: { select: { username: true } } } } },
    });
    if (student?.profile) {
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

  await prisma.expenseEntry.create({
    data: {
      studentId: parsed.data.studentId,
      amount: parsed.data.amount,
      description: parsed.data.description,
      date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
    },
  });

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

export async function resetUserPassword(userId: string): Promise<{ error?: string; tempPassword?: string }> {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "admin")) return { error: "Unauthorized" };

  // Don't allow resetting your own password through this path
  if (userId === session.user.id) return { error: "Use the change password form to update your own password" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return { error: "User not found" };

  // Generate a random 12-char temp password
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  const tempPassword = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

  const passwordHash = await hash(tempPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, forcePasswordChange: true } });

  return { tempPassword };
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
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ADMIN", "PRESIDENT", "TREASURER", "FUNDRAISING_MANAGER", "BOARD_MEMBER"]),
});

export async function createStaffUser(
  _prev: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "admin")) return { error: "Unauthorized" };

  const parsed = CreateStaffUserSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { username, password, role } = parsed.data;

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return { error: "A user with that username already exists" };

  // Only one TREASURER allowed at a time
  if (role === "TREASURER") {
    const existing = await prisma.user.findFirst({ where: { role: "TREASURER" } });
    if (existing) return { error: `A Treasurer account already exists (${existing.username}). Delete it before creating a new one.` };
  }

  const passwordHash = await hash(password, 12);
  await prisma.user.create({
    data: { username, passwordHash, role, forcePasswordChange: false },
  });

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
    include: { student: true },
  });
  if (!req || req.status !== "PENDING") return { error: "Request not found or already processed" };

  await prisma.$transaction([
    prisma.fundRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        notes: notes ?? null,
        reviewedBy: session.user.name,
        reviewedAt: new Date(),
      },
    }),
    // Automatically create an expense entry when approved
    prisma.expenseEntry.create({
      data: {
        studentId: req.studentId,
        description: req.description,
        amount: req.amount,
        date: new Date(),
      },
    }),
  ]);

  revalidatePath("/admin/fund-requests");
  return { success: true };
}

// ─── Treasurer: deny a fund request ──────────────────────────────────────────

export async function denyFundRequest(
  requestId: string,
  notes: string,
): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "fundRequests")) return { error: "Unauthorized" };

  const req = await prisma.fundRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING") return { error: "Request not found or already processed" };

  if (!notes?.trim()) return { error: "A reason is required when denying a request" };

  await prisma.fundRequest.update({
    where: { id: requestId },
    data: {
      status: "DENIED",
      notes,
      reviewedBy: session.user.name,
      reviewedAt: new Date(),
    },
  });

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

  const now = new Date();
  const currentYear = now.getFullYear();

  const [dateConfig, yearConfig] = await Promise.all([
    prisma.appConfig.findUnique({ where: { key: "gradeAdvancementDate" } }),
    prisma.appConfig.findUnique({ where: { key: "gradeAdvancementYear" } }),
  ]);

  const [configMonth, configDay] = (dateConfig?.value ?? "7/1").split("/").map(Number);
  const advancementDate = new Date(currentYear, configMonth - 1, configDay);
  const advancementLabel = advancementDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });

  if (!force && now < advancementDate) {
    return { skipped: `Grade advancement runs on or after ${advancementLabel}. Current date is ${now.toLocaleDateString()}.` };
  }

  if (!force && yearConfig?.value === String(currentYear)) {
    return { skipped: `Grades have already been advanced for ${currentYear}.` };
  }

  const students = await prisma.student.findMany({
    where: { graduated: false },
    select: { id: true, grade: true },
  });

  let advanced = 0;
  let graduated = 0;

  await prisma.$transaction(async (tx) => {
    for (const s of students) {
      const gradeNum = parseInt(s.grade ?? "", 10);
      if (isNaN(gradeNum)) continue; // non-numeric grade — skip

      if (gradeNum >= 12) {
        await tx.student.update({
          where: { id: s.id },
          data: { graduated: true, graduatedAt: now },
        });
        graduated++;
      } else {
        await tx.student.update({
          where: { id: s.id },
          data: { grade: String(gradeNum + 1) },
        });
        advanced++;
      }
    }

    await tx.appConfig.upsert({
      where: { key: "gradeAdvancementYear" },
      update: { value: String(currentYear) },
      create: { key: "gradeAdvancementYear", value: String(currentYear) },
    });
  });

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

// ─── President / Admin: unlock permanently locked account ────────────────────

export async function unlockAccount(
  userId: string,
): Promise<{ error?: string; success?: boolean }> {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "unlockAccounts")) return { error: "Unauthorized" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, permanentLock: true },
  });
  if (!user) return { error: "User not found" };
  if (!user.permanentLock) return { error: "Account is not permanently locked" };

  await prisma.user.update({
    where: { id: userId },
    data: {
      permanentLock: false,
      forcePasswordChange: true,
      lockoutCount: 0,
      loginAttempts: 0,
      loginWindowStart: null,
      lockedUntil: null,
    },
  });

  revalidatePath("/admin/locked-accounts");
  return { success: true };
}
