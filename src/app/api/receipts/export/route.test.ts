import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { emailReceipt: { findMany: vi.fn() } },
}));

import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

const adminSession = { user: { id: "u-admin", name: "admin@school.org", role: "ADMIN" } };

function req(query = "") {
  return new NextRequest(`http://localhost/api/receipts/export${query}`);
}

describe("GET /api/receipts/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentSession).mockResolvedValue(adminSession as never);
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null as never);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("neutralizes formula-injection payloads in free-text fields", async () => {
    vi.mocked(prisma.emailReceipt.findMany).mockResolvedValue([
      {
        receiptNumber: 1,
        id: "receipt-1",
        sentAt: new Date("2026-01-15"),
        type: "deposit",
        toName: '=cmd|"/c calc"!A0',
        toEmail: "+1234@example.com",
        studentName: "-Alice",
        amount: "50.00",
        description: "@SUM(1+1)",
        emailSent: true,
      },
    ] as never);

    const res = await GET(req());
    const csv = await res.text();

    expect(csv).toContain("'=cmd|\"\"/c calc\"\"!A0");
    expect(csv).toContain("'+1234@example.com");
    expect(csv).toContain("'-Alice");
    expect(csv).toContain("'@SUM(1+1)");
  });

  it("leaves the numeric Amount column alone, including negative-looking values", async () => {
    vi.mocked(prisma.emailReceipt.findMany).mockResolvedValue([
      {
        receiptNumber: 2,
        id: "receipt-2",
        sentAt: new Date("2026-01-15"),
        type: "withdrawal",
        toName: "Jane Doe",
        toEmail: "jane@example.com",
        studentName: "Bob",
        amount: "-25.00",
        description: "Refund",
        emailSent: true,
      },
    ] as never);

    const res = await GET(req());
    const csv = await res.text();

    // toFixed(2) on a negative Decimal already reads "-25.00" — must NOT
    // become "'-25.00" or Excel will treat the amount as text, not a number.
    expect(csv).toContain(",-25.00,");
  });

  it("leaves ordinary values untouched", async () => {
    vi.mocked(prisma.emailReceipt.findMany).mockResolvedValue([
      {
        receiptNumber: 3,
        id: "receipt-3",
        sentAt: new Date("2026-01-15"),
        type: "deposit",
        toName: "Jane Doe",
        toEmail: "jane@example.com",
        studentName: "Alice",
        amount: "50.00",
        description: "Candy sale",
        emailSent: true,
      },
    ] as never);

    const res = await GET(req());
    const csv = await res.text();

    expect(csv).toContain("Jane Doe,jane@example.com,Alice,50.00,Candy sale,Yes");
  });
});
