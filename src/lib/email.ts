import nodemailer from "nodemailer";
import { prisma } from "./prisma";

const CONFIG_KEYS = [
  "email.host",
  "email.port",
  "email.secure",
  "email.user",
  "email.pass",
  "email.from",
  "email.depositSubject",
  "email.depositBody",
  "email.approvalSubject",
  "email.approvalBody",
  "email.fundRequestDeniedSubject",
  "email.fundRequestDeniedBody",
  "email.withdrawEnabled",
  "email.withdrawSubject",
  "email.withdrawBody",
] as const;

export const DEFAULT_DEPOSIT_SUBJECT = "Deposit Receipt #{{receiptNumber}} — {{studentName}}";
export const DEFAULT_DEPOSIT_BODY = [
  "<p>Hi {{parentName}},</p>",
  "<p>A fundraising deposit has been recorded for <strong>{{studentName}}</strong>.</p>",
  "<p>",
  "  <strong>Receipt #:</strong> {{receiptNumber}}<br>",
  "  <strong>Amount:</strong> ${{amount}}<br>",
  "  <strong>Description:</strong> {{description}}<br>",
  "  <strong>Date:</strong> {{date}}",
  "</p>",
  "<p>If you have any questions, please contact your school organization.</p>",
].join("\n");

export const DEFAULT_WITHDRAW_SUBJECT = "Withdrawal Notice #{{receiptNumber}} — {{studentName}}";
export const DEFAULT_WITHDRAW_BODY = [
  "<p>Hi {{parentName}},</p>",
  "<p>A withdrawal has been recorded against <strong>{{studentName}}</strong>'s account.</p>",
  "<p>",
  "  <strong>Receipt #:</strong> {{receiptNumber}}<br>",
  "  <strong>Amount:</strong> ${{amount}}<br>",
  "  <strong>Description:</strong> {{description}}<br>",
  "  <strong>Date:</strong> {{date}}",
  "</p>",
  "<p>If you have any questions, please contact your school organization.</p>",
].join("\n");

export const DEFAULT_APPROVAL_SUBJECT = "Your account has been approved";
export const DEFAULT_APPROVAL_BODY = [
  "<p>Hi {{parentName}},</p>",
  "<p>Your registration has been approved. You can now log in to view your student's fundraising account.</p>",
  '<p><a href="{{loginUrl}}">Log in to your account</a></p>',
  "<p>If you have any questions, please contact your school organization.</p>",
].join("\n");

export const DEFAULT_FUND_REQUEST_DENIED_SUBJECT = "Fund request denied — {{studentName}}";
export const DEFAULT_FUND_REQUEST_DENIED_BODY = [
  "<p>Hi {{parentName}},</p>",
  "<p>Your fund request for <strong>{{studentName}}</strong> has been denied.</p>",
  "<p>",
  "  <strong>Amount:</strong> ${{amount}}<br>",
  "  <strong>Reason:</strong> {{reason}}<br>",
  "  <strong>Date:</strong> {{date}}",
  "</p>",
  "<p>If you have any questions, please contact your school organization.</p>",
].join("\n");

export async function getEmailConfig() {
  const rows = await prisma.appConfig.findMany({ where: { key: { in: [...CONFIG_KEYS] } } });
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    host: m["email.host"] ?? "",
    port: parseInt(m["email.port"] ?? "587", 10),
    secure: m["email.secure"] === "true",
    user: m["email.user"] ?? "",
    pass: m["email.pass"] ?? "",
    from: m["email.from"] ?? "",
    depositSubject: m["email.depositSubject"] ?? DEFAULT_DEPOSIT_SUBJECT,
    depositBody: m["email.depositBody"] ?? DEFAULT_DEPOSIT_BODY,
    approvalSubject: m["email.approvalSubject"] ?? DEFAULT_APPROVAL_SUBJECT,
    approvalBody: m["email.approvalBody"] ?? DEFAULT_APPROVAL_BODY,
    fundRequestDeniedSubject: m["email.fundRequestDeniedSubject"] ?? DEFAULT_FUND_REQUEST_DENIED_SUBJECT,
    fundRequestDeniedBody: m["email.fundRequestDeniedBody"] ?? DEFAULT_FUND_REQUEST_DENIED_BODY,
    withdrawEnabled: m["email.withdrawEnabled"] === "true",
    withdrawSubject: m["email.withdrawSubject"] ?? DEFAULT_WITHDRAW_SUBJECT,
    withdrawBody: m["email.withdrawBody"] ?? DEFAULT_WITHDRAW_BODY,
  };
}

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

async function trySend(
  cfg: Awaited<ReturnType<typeof getEmailConfig>>,
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  if (!cfg.host || !cfg.from) return false;
  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
    await transporter.sendMail({ from: cfg.from, to, subject, html });
    return true;
  } catch (err) {
    console.error(`[email] send to ${to} failed:`, err);
    return false;
  }
}

async function getNextReceiptNumber(): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      const current = await tx.appConfig.findUnique({ where: { key: "email.receiptCounter" } });
      const next = current ? parseInt(current.value, 10) + 1 : 1;
      await tx.appConfig.upsert({
        where: { key: "email.receiptCounter" },
        update: { value: String(next) },
        create: { key: "email.receiptCounter", value: String(next) },
      });
      return next;
    },
    { isolationLevel: "Serializable" },
  );
}

export async function sendDepositReceipt(opts: {
  to: string;
  parentName: string;
  studentName: string;
  studentId?: string;
  amount: string;
  description: string;
  date: string;
}): Promise<boolean> {
  const cfg = await getEmailConfig();
  const receiptNumber = await getNextReceiptNumber();
  const vars: Record<string, string> = {
    parentName: opts.parentName,
    studentName: opts.studentName,
    amount: opts.amount,
    description: opts.description,
    date: opts.date,
    receiptNumber: String(receiptNumber),
  };
  const subject = render(cfg.depositSubject, vars);
  const html = render(cfg.depositBody, vars);

  const emailSent = await trySend(cfg, opts.to, subject, html);

  try {
    await prisma.emailReceipt.create({
      data: {
        type: "deposit",
        receiptNumber,
        toEmail: opts.to,
        toName: opts.parentName,
        subject,
        htmlBody: html,
        studentId: opts.studentId ?? null,
        studentName: opts.studentName,
        amount: opts.amount,
        description: opts.description,
        emailSent,
      },
    });
  } catch { /* receipt logging is best-effort */ }

  return emailSent;
}

export async function sendApprovalEmail(opts: {
  to: string;
  parentName: string;
  loginUrl: string;
}): Promise<boolean> {
  const cfg = await getEmailConfig();
  const vars: Record<string, string> = {
    parentName: opts.parentName,
    loginUrl: opts.loginUrl,
  };
  const subject = render(cfg.approvalSubject, vars);
  const html = render(cfg.approvalBody, vars);

  const emailSent = await trySend(cfg, opts.to, subject, html);

  try {
    await prisma.emailReceipt.create({
      data: {
        type: "approval",
        toEmail: opts.to,
        toName: opts.parentName,
        subject,
        htmlBody: html,
        studentId: null,
        studentName: null,
        amount: null,
        description: null,
        emailSent,
      },
    });
  } catch { /* receipt logging is best-effort */ }

  return emailSent;
}

export async function sendFundRequestDecisionEmail(opts: {
  to: string;
  parentName: string;
  studentName: string;
  studentId?: string;
  amount: string;
  reason: string;
  status: "APPROVED" | "DENIED";
  date: string;
}): Promise<boolean> {
  const cfg = await getEmailConfig();
  const vars: Record<string, string> = {
    parentName: opts.parentName,
    studentName: opts.studentName,
    amount: opts.amount,
    reason: opts.reason,
    date: opts.date,
  };

  const subject = opts.status === "APPROVED"
    ? render(cfg.approvalSubject, vars)
    : render(cfg.fundRequestDeniedSubject, vars);
  const html = opts.status === "APPROVED"
    ? render(cfg.approvalBody, vars)
    : render(cfg.fundRequestDeniedBody, vars);

  const emailSent = await trySend(cfg, opts.to, subject, html);

  try {
    await prisma.emailReceipt.create({
      data: {
        type: opts.status === "APPROVED" ? "approval" : "denial",
        toEmail: opts.to,
        toName: opts.parentName,
        subject,
        htmlBody: html,
        studentId: opts.studentId ?? null,
        studentName: opts.studentName,
        amount: opts.amount,
        description: opts.reason,
        emailSent,
      },
    });
  } catch { /* receipt logging is best-effort */ }

  return emailSent;
}

export async function sendWithdrawReceipt(opts: {
  to: string;
  parentName: string;
  studentName: string;
  studentId?: string;
  amount: string;
  description: string;
  date: string;
}): Promise<boolean> {
  const cfg = await getEmailConfig();
  if (!cfg.withdrawEnabled) return false;

  const receiptNumber = await getNextReceiptNumber();
  const vars: Record<string, string> = {
    parentName: opts.parentName,
    studentName: opts.studentName,
    amount: opts.amount,
    description: opts.description,
    date: opts.date,
    receiptNumber: String(receiptNumber),
  };
  const subject = render(cfg.withdrawSubject, vars);
  const html = render(cfg.withdrawBody, vars);

  const emailSent = await trySend(cfg, opts.to, subject, html);

  try {
    await prisma.emailReceipt.create({
      data: {
        type: "withdrawal",
        receiptNumber,
        toEmail: opts.to,
        toName: opts.parentName,
        subject,
        htmlBody: html,
        studentId: opts.studentId ?? null,
        studentName: opts.studentName,
        amount: opts.amount,
        description: opts.description,
        emailSent,
      },
    });
  } catch { /* receipt logging is best-effort */ }

  return emailSent;
}

export async function resendReceiptEmail(receiptId: string): Promise<{ success: boolean; error?: string }> {
  const receipt = await prisma.emailReceipt.findUnique({ where: { id: receiptId } });
  if (!receipt) return { success: false, error: "Receipt not found" };

  const cfg = await getEmailConfig();
  if (!cfg.host || !cfg.from) return { success: false, error: "SMTP is not configured" };

  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
    await transporter.sendMail({
      from: cfg.from,
      to: receipt.toEmail,
      subject: receipt.subject,
      html: receipt.htmlBody,
    });
  } catch (err) {
    console.error(`[email] resend to ${receipt.toEmail} failed:`, err);
    return { success: false, error: "Send failed — check SMTP settings and try again" };
  }

  await prisma.emailReceipt.update({ where: { id: receiptId }, data: { emailSent: true } });
  return { success: true };
}

export async function purgeReceiptsOlderThan5Years(): Promise<number> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 5);
  const result = await prisma.emailReceipt.deleteMany({
    where: { sentAt: { lt: cutoff } },
  });
  return result.count;
}

export async function sendTestEmail(to: string) {
  const cfg = await getEmailConfig();
  if (!cfg.host || !cfg.from) throw new Error("SMTP not configured");
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  await transporter.sendMail({
    from: cfg.from,
    to,
    subject: "Test email from MoneyFinder",
    html: "<p>Your email configuration is working correctly.</p>",
  });
}
