import { requirePermission } from "@/lib/secure-page";
import { prisma } from "@/lib/prisma";
import { StudentActivityList } from "@/components/student-activity-list";

export default async function AdminStudentsPage() {
  await requirePermission("allStudents");

  const raw = await prisma.student.findMany({
    include: {
      profile: { select: { firstName: true, lastName: true } },
      fundraising: { orderBy: { date: "desc" } },
      expenses: { orderBy: { date: "desc" } },
    },
    orderBy: [{ profile: { lastName: "asc" } }, { firstName: "asc" }],
  });

  const students = raw.map((s) => ({
    ...s,
    fundraising: s.fundraising.map((e) => ({ ...e, amount: Number(e.amount) })),
    expenses: s.expenses.map((e) => ({ ...e, amount: Number(e.amount) })),
  }));

  const totalRaised = students.reduce((sum, s) => sum + s.fundraising.reduce((a, e) => a + e.amount, 0), 0);
  const totalSpent = students.reduce((sum, s) => sum + s.expenses.reduce((a, e) => a + e.amount, 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">All Students</h2>
          <p className="text-sm text-slate-400">{students.length} student{students.length !== 1 ? "s" : ""} registered</p>
        </div>
        <div className="flex gap-6 text-sm">
          <span className="text-emerald-400 font-semibold">Raised: ${totalRaised.toFixed(2)}</span>
          <span className="text-rose-400 font-semibold">Spent: ${totalSpent.toFixed(2)}</span>
          <span className={`font-semibold ${totalRaised - totalSpent >= 0 ? "text-cyan-400" : "text-amber-400"}`}>
            Balance: ${(totalRaised - totalSpent).toFixed(2)}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/70 overflow-hidden">
        {/* Column headers */}
        {students.length > 0 && (
          <div className="grid grid-cols-5 gap-2 border-b border-slate-700 px-11 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Student</span>
            <span>Parent</span>
            <span>Fundraising</span>
            <span>Expenses</span>
            <span>Balance</span>
          </div>
        )}
        <StudentActivityList students={students} />
      </div>
    </div>
  );
}
