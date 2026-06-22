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
] as const;

export const DEFAULT_DEPOSIT_SUBJECT = "Fundraising deposit recorded for {{studentName}}";
export const DEFAULT_DEPOSIT_BODY = [
  "<p>Hi {{parentName}},</p>",
  "<p>A fundraising deposit has been recorded for <strong>{{studentName}}</strong>.</p>",
  "<p>",
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
  } catch {
    return false;
  }
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
  const vars: Record<string, string> = {
    parentName: opts.parentName,
    studentName: opts.studentName,
    amount: opts.amount,
    description: opts.description,
    date: opts.date,
  };
  const subject = render(cfg.depositSubject, vars);
  const html = render(cfg.depositBody, vars);

  const emailSent = await trySend(cfg, opts.to, subject, html);

  try {
    await prisma.emailReceipt.create({
      data: {
        type: "deposit",
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
