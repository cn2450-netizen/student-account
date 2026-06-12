import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

function escapeCsv(value: string | number | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session?.user || (!can(session.user.role, "fundRequests") && !can(session.user.role, "allFunds"))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const year       = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  const typeFilter = searchParams.get("type") ?? "all";

  const from = new Date(year, 0, 1);
  const to   = new Date(year + 1, 0, 1);

  const receipts = await prisma.emailReceipt.findMany({
    where: {
      sentAt: { gte: from, lt: to },
      ...(typeFilter !== "all" ? { type: typeFilter } : {}),
    },
    orderBy: { sentAt: "asc" },
  });

  const headers = ["Receipt ID", "Date", "Type", "Recipient Name", "Recipient Email", "Student", "Amount", "Description", "Email Sent"];

  const rows = receipts.map((r) => [
    r.id,
    new Date(r.sentAt).toLocaleDateString("en-US"),
    r.type,
    r.toName,
    r.toEmail,
    r.studentName ?? "",
    r.amount != null ? Number(r.amount).toFixed(2) : "",
    r.description ?? "",
    r.emailSent ? "Yes" : "No",
  ]);

  const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");

  const filename = `receipts-${year}${typeFilter !== "all" ? `-${typeFilter}` : ""}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
