import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/secure-page";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { FundraisingForm } from "@/components/fundraising-form";
import { FundraisingEntriesTable } from "@/components/fundraising-entries-table";

export default async function AdminFundraisingPage() {
  const user = await requireAuth();
  if (!can(user.role, "allFunds") && !can(user.role, "manageFundraising")) redirect("/dashboard");

  const canAdd = can(user.role, "manageFundraising");

  const [raw, students, fundraisers] = await Promise.all([
    prisma.fundraisingEntry.findMany({
      // Graduated students' entries move to the Graduated Seniors page, not this ledger.
      where: { student: { graduated: false } },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { date: "desc" },
      take: 200,
    }),
    canAdd ? prisma.student.findMany({ where: { graduated: false }, orderBy: [{ firstName: "asc" }] }) : Promise.resolve([]),
    canAdd ? prisma.fundraiser.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  const entries = raw.map((e) => ({ ...e, amount: Number(e.amount) }));
  const total = entries.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Funds Applied</h2>
        <p className="text-sm text-slate-400">
          {entries.length} entr{entries.length === 1 ? "y" : "ies"} — Total:{" "}
          <span className="text-emerald-400 font-semibold">${total.toFixed(2)}</span>
        </p>
      </div>

      {canAdd && <FundraisingForm students={students} fundraisers={fundraisers} />}

      <div className="rounded-xl border border-slate-700 bg-slate-900/70 overflow-hidden">
        <FundraisingEntriesTable entries={entries} canEdit={canAdd} />
      </div>
    </div>
  );
}
