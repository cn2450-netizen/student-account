import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module mocks (hoisted before imports) ────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appConfig: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    emailReceipt: { create: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

// ── Imports (resolved against mocks above) ───────────────────────────────────

import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";
import {
  getEmailConfig,
  sendDepositReceipt,
  sendApprovalEmail,
  sendWithdrawReceipt,
  purgeReceiptsOlderThan5Years,
  DEFAULT_DEPOSIT_SUBJECT,
  DEFAULT_DEPOSIT_BODY,
  DEFAULT_APPROVAL_SUBJECT,
  DEFAULT_APPROVAL_BODY,
  DEFAULT_WITHDRAW_SUBJECT,
  DEFAULT_WITHDRAW_BODY,
} from "@/lib/email";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSmtpRows(overrides: Record<string, string> = {}) {
  const base: Record<string, string> = {
    "email.host": "smtp.example.com",
    "email.port": "587",
    "email.secure": "false",
    "email.user": "user@example.com",
    "email.pass": "secret",
    "email.from": "School <noreply@school.org>",
    ...overrides,
  };
  return Object.entries(base).map(([key, value]) => ({ key, value }));
}

function mockSendMail(resolves = true) {
  const sendMail = resolves
    ? vi.fn().mockResolvedValue({ messageId: "test-id" })
    : vi.fn().mockRejectedValue(new Error("Connection refused"));
  vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as ReturnType<typeof nodemailer.createTransport>);
  return sendMail;
}

// ── getEmailConfig() ─────────────────────────────────────────────────────────

describe("getEmailConfig()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns built-in defaults when AppConfig has no email keys", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([]);

    const cfg = await getEmailConfig();

    expect(cfg.host).toBe("");
    expect(cfg.port).toBe(587);
    expect(cfg.secure).toBe(false);
    expect(cfg.user).toBe("");
    expect(cfg.pass).toBe("");
    expect(cfg.from).toBe("");
    expect(cfg.depositSubject).toBe(DEFAULT_DEPOSIT_SUBJECT);
    expect(cfg.depositBody).toBe(DEFAULT_DEPOSIT_BODY);
    expect(cfg.approvalSubject).toBe(DEFAULT_APPROVAL_SUBJECT);
    expect(cfg.approvalBody).toBe(DEFAULT_APPROVAL_BODY);
  });

  it("reads host, port, TLS, and from address from AppConfig", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue(
      makeSmtpRows({ "email.port": "465", "email.secure": "true" }),
    );

    const cfg = await getEmailConfig();

    expect(cfg.host).toBe("smtp.example.com");
    expect(cfg.port).toBe(465);
    expect(cfg.secure).toBe(true);
    expect(cfg.from).toBe("School <noreply@school.org>");
  });

  it("parses secure as false for any value other than 'true'", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue(
      makeSmtpRows({ "email.secure": "false" }),
    );
    expect((await getEmailConfig()).secure).toBe(false);
  });

  it("reads custom deposit and approval templates from AppConfig", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([
      { key: "email.depositSubject", value: "Custom deposit subject" },
      { key: "email.approvalSubject", value: "Custom approval subject" },
      { key: "email.depositBody", value: "<p>Custom body</p>" },
      { key: "email.approvalBody", value: "<p>Custom approval</p>" },
    ]);

    const cfg = await getEmailConfig();
    expect(cfg.depositSubject).toBe("Custom deposit subject");
    expect(cfg.approvalSubject).toBe("Custom approval subject");
    expect(cfg.depositBody).toBe("<p>Custom body</p>");
    expect(cfg.approvalBody).toBe("<p>Custom approval</p>");
  });

  it("falls back to defaults for missing template keys even when other keys exist", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue(
      makeSmtpRows(),
    );
    const cfg = await getEmailConfig();
    expect(cfg.depositSubject).toBe(DEFAULT_DEPOSIT_SUBJECT);
    expect(cfg.depositBody).toBe(DEFAULT_DEPOSIT_BODY);
  });
});

// ── sendDepositReceipt() ──────────────────────────────────────────────────────

const DEPOSIT_OPTS = {
  to: "parent@example.com",
  parentName: "Jane Doe",
  studentName: "Alice Doe",
  studentId: "student-abc",
  amount: "50.00",
  description: "Candy sale",
  date: "June 12, 2026",
};

describe("sendDepositReceipt()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.emailReceipt.create).mockResolvedValue({} as never);
    vi.mocked(prisma.appConfig.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.appConfig.upsert).mockResolvedValue({} as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof prisma) => Promise<number>) => fn(prisma));
  });

  it("always creates a receipt record regardless of SMTP configuration", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([]); // no SMTP configured

    await sendDepositReceipt(DEPOSIT_OPTS);

    expect(prisma.emailReceipt.create).toHaveBeenCalledOnce();
  });

  it("sets emailSent=false when SMTP host is not configured", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([]);

    await sendDepositReceipt(DEPOSIT_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.emailSent).toBe(false);
  });

  it("sets emailSent=false when the SMTP server rejects the connection", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue(makeSmtpRows());
    mockSendMail(false);

    await sendDepositReceipt(DEPOSIT_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.emailSent).toBe(false);
  });

  it("sets emailSent=true when the email is successfully delivered", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue(makeSmtpRows());
    mockSendMail(true);

    await sendDepositReceipt(DEPOSIT_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.emailSent).toBe(true);
  });

  it("still creates a receipt when email delivery succeeds", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue(makeSmtpRows());
    mockSendMail(true);

    await sendDepositReceipt(DEPOSIT_OPTS);

    expect(prisma.emailReceipt.create).toHaveBeenCalledOnce();
  });

  it("saves correct type, recipient, and student metadata on the receipt", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([]);

    await sendDepositReceipt(DEPOSIT_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.type).toBe("deposit");
    expect(data.toEmail).toBe("parent@example.com");
    expect(data.toName).toBe("Jane Doe");
    expect(data.studentId).toBe("student-abc");
    expect(data.studentName).toBe("Alice Doe");
    expect(data.amount).toBe("50.00");
    expect(data.description).toBe("Candy sale");
  });

  it("substitutes parentName in the rendered email body", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([]);

    await sendDepositReceipt(DEPOSIT_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.htmlBody).toContain("Jane Doe");
  });

  it("substitutes studentName in the rendered subject", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([]);

    await sendDepositReceipt(DEPOSIT_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.subject).toContain("Alice Doe");
  });

  it("substitutes amount, description, and date in the rendered body", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([]);

    await sendDepositReceipt(DEPOSIT_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.htmlBody).toContain("50.00");
    expect(data.htmlBody).toContain("Candy sale");
    expect(data.htmlBody).toContain("June 12, 2026");
  });

  it("leaves unreplaced placeholders in the stored body when a custom template omits vars", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([
      { key: "email.depositBody", value: "Hello {{parentName}}, amount: {{amount}}, extra: {{missing}}" },
    ]);

    await sendDepositReceipt(DEPOSIT_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.htmlBody).toContain("Jane Doe");
    expect(data.htmlBody).toContain("50.00");
    expect(data.htmlBody).toContain("{{missing}}"); // unreplaced placeholder preserved
  });

  it("passes the rendered subject and html to nodemailer when SMTP is configured", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue(makeSmtpRows());
    const sendMail = mockSendMail(true);

    await sendDepositReceipt(DEPOSIT_OPTS);

    const mailCall = sendMail.mock.calls[0][0];
    expect(mailCall.to).toBe("parent@example.com");
    expect(mailCall.from).toBe("School <noreply@school.org>");
    expect(mailCall.subject).toContain("Alice Doe");
    expect(mailCall.html).toContain("Jane Doe");
  });

  it("works without studentId (studentId stored as null)", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([]);
    const { studentId: _, ...optsWithoutId } = DEPOSIT_OPTS;

    await sendDepositReceipt(optsWithoutId);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.studentId).toBeNull();
  });

  it("assigns receiptNumber=1 when no counter exists and stores it on the receipt record", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([]);
    vi.mocked(prisma.appConfig.findUnique).mockResolvedValue(null); // no existing counter

    await sendDepositReceipt(DEPOSIT_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.receiptNumber).toBe(1);
  });

  it("increments the counter when one already exists", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([]);
    vi.mocked(prisma.appConfig.findUnique).mockResolvedValue(
      { key: "email.receiptCounter", value: "41" } as never,
    );

    await sendDepositReceipt(DEPOSIT_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.receiptNumber).toBe(42);
  });

  it("includes receiptNumber in the rendered subject and body", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([]);
    vi.mocked(prisma.appConfig.findUnique).mockResolvedValue(
      { key: "email.receiptCounter", value: "9" } as never,
    );

    await sendDepositReceipt(DEPOSIT_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.subject).toContain("#10");
    expect(data.htmlBody).toContain("10");
  });
});

// ── sendApprovalEmail() ───────────────────────────────────────────────────────

describe("sendApprovalEmail()", () => {
  const APPROVAL_OPTS = {
    to: "parent@example.com",
    parentName: "Jane Doe",
    loginUrl: "https://school.org/login",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.emailReceipt.create).mockResolvedValue({} as never);
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([]);
  });

  it("always creates a receipt record", async () => {
    await sendApprovalEmail(APPROVAL_OPTS);
    expect(prisma.emailReceipt.create).toHaveBeenCalledOnce();
  });

  it("stores type=approval with null student and amount fields", async () => {
    await sendApprovalEmail(APPROVAL_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.type).toBe("approval");
    expect(data.studentId).toBeNull();
    expect(data.studentName).toBeNull();
    expect(data.amount).toBeNull();
    expect(data.description).toBeNull();
  });

  it("substitutes parentName in the rendered body", async () => {
    await sendApprovalEmail(APPROVAL_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.htmlBody).toContain("Jane Doe");
  });

  it("substitutes loginUrl in the rendered body", async () => {
    await sendApprovalEmail(APPROVAL_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.htmlBody).toContain("https://school.org/login");
  });

  it("sets emailSent=false when SMTP not configured", async () => {
    await sendApprovalEmail(APPROVAL_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.emailSent).toBe(false);
  });

  it("sets emailSent=true on successful delivery", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue(makeSmtpRows());
    mockSendMail(true);

    await sendApprovalEmail(APPROVAL_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.emailSent).toBe(true);
  });
});

// ── purgeReceiptsOlderThan5Years() ────────────────────────────────────────────

describe("purgeReceiptsOlderThan5Years()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls deleteMany with a cutoff 5 years in the past", async () => {
    vi.mocked(prisma.emailReceipt.deleteMany).mockResolvedValue({ count: 3 });

    const before = new Date();
    before.setFullYear(before.getFullYear() - 5);

    await purgeReceiptsOlderThan5Years();

    const call = vi.mocked(prisma.emailReceipt.deleteMany).mock.calls[0][0];
    const cutoff: Date = (call as { where: { sentAt: { lt: Date } } }).where.sentAt.lt;

    // Cutoff must be approximately 5 years ago (within 5 seconds of our reference)
    const after = new Date();
    after.setFullYear(after.getFullYear() - 5);
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before.getTime() - 5000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after.getTime() + 5000);
  });

  it("returns the number of deleted records", async () => {
    vi.mocked(prisma.emailReceipt.deleteMany).mockResolvedValue({ count: 7 });

    const result = await purgeReceiptsOlderThan5Years();

    expect(result).toBe(7);
  });

  it("returns 0 when no records are old enough to purge", async () => {
    vi.mocked(prisma.emailReceipt.deleteMany).mockResolvedValue({ count: 0 });

    const result = await purgeReceiptsOlderThan5Years();

    expect(result).toBe(0);
  });
});

// ── sendWithdrawReceipt() ─────────────────────────────────────────────────────

const WITHDRAW_OPTS = {
  to: "parent@example.com",
  parentName: "Jane Doe",
  studentName: "Alice Doe",
  studentId: "student-abc",
  amount: "25.00",
  description: "Supply fee",
  date: "June 22, 2026",
};

describe("sendWithdrawReceipt()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.emailReceipt.create).mockResolvedValue({} as never);
    vi.mocked(prisma.appConfig.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.appConfig.upsert).mockResolvedValue({} as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof prisma) => Promise<number>) => fn(prisma));
  });

  it("returns false immediately when withdrawEnabled is false without sending or saving", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([]); // withdrawEnabled defaults to false

    const result = await sendWithdrawReceipt(WITHDRAW_OPTS);

    expect(result).toBe(false);
    expect(prisma.emailReceipt.create).not.toHaveBeenCalled();
  });

  it("does not call nodemailer when withdrawEnabled is false", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([]);

    await sendWithdrawReceipt(WITHDRAW_OPTS);

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it("saves a receipt and sends when withdrawEnabled is true and SMTP is configured", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([
      ...makeSmtpRows(),
      { key: "email.withdrawEnabled", value: "true" },
    ]);
    mockSendMail(true);

    const result = await sendWithdrawReceipt(WITHDRAW_OPTS);

    expect(result).toBe(true);
    expect(prisma.emailReceipt.create).toHaveBeenCalledOnce();
  });

  it("stores type=withdrawal with correct metadata", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([
      ...makeSmtpRows(),
      { key: "email.withdrawEnabled", value: "true" },
    ]);
    mockSendMail(true);

    await sendWithdrawReceipt(WITHDRAW_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.type).toBe("withdrawal");
    expect(data.toEmail).toBe("parent@example.com");
    expect(data.studentId).toBe("student-abc");
    expect(data.amount).toBe("25.00");
    expect(data.description).toBe("Supply fee");
  });

  it("uses the default withdraw template when no custom template is stored", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([
      { key: "email.withdrawEnabled", value: "true" },
    ]);

    await sendWithdrawReceipt(WITHDRAW_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.subject).toContain("Alice Doe");
    expect(data.htmlBody).toContain("Jane Doe");
    expect(data.htmlBody).toContain("25.00");
    expect(data.htmlBody).toContain("Supply fee");
  });

  it("sets emailSent=false when SMTP is not configured even if withdrawEnabled is true", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([
      { key: "email.withdrawEnabled", value: "true" },
      // no SMTP host/from
    ]);

    await sendWithdrawReceipt(WITHDRAW_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.emailSent).toBe(false);
  });

  it("assigns a receiptNumber and stores it on the receipt record", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([
      { key: "email.withdrawEnabled", value: "true" },
    ]);
    vi.mocked(prisma.appConfig.findUnique).mockResolvedValue(
      { key: "email.receiptCounter", value: "99" } as never,
    );

    await sendWithdrawReceipt(WITHDRAW_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.receiptNumber).toBe(100);
  });

  it("includes receiptNumber in the rendered subject and body", async () => {
    vi.mocked(prisma.appConfig.findMany).mockResolvedValue([
      { key: "email.withdrawEnabled", value: "true" },
    ]);
    vi.mocked(prisma.appConfig.findUnique).mockResolvedValue(null);

    await sendWithdrawReceipt(WITHDRAW_OPTS);

    const { data } = vi.mocked(prisma.emailReceipt.create).mock.calls[0][0];
    expect(data.subject).toContain("#1");
    expect(data.htmlBody).toContain("1");
  });
});
