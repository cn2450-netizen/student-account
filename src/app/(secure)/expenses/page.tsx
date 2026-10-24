import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { ExpenseForm } from "@/components/expense-form";

export default async function ExpensesPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login");

  const isAdmin = can(session.user.role, "allFunds");
  const canEnter = can(session.user.role, "enterExpenses");
  const isParent = session.user.role === "PARENT";

  let students: Array<{ id: string; firstName: string; lastName: string }> = [];
  let entries: Array<{
    id: string;
    amount: number;
    description: string;
    date: Date;
    student: { firstName: string; lastName: string };
  }> = [];

  if (isAdmin) {
    students = await prisma.student.findMany({ orderBy: [{ firstName: "asc" }] });
    const raw = await prisma.expenseEntry.findMany({
      include: { student: { select: { firstName: true, lastName: true } } },
      orderBy: { date: "desc" },
      take: 100,
    });
    entries = raw.map((e) => ({ ...e, amount: Number(e.amount) }));
  } else {
    const profile = await prisma.parentProfile.findUnique({
      where: { userId: session.user.id },
      include: { students: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (profile) {
      students = profile.students;
      const profileStudentIds = profile.students.map((s) => s.id);
      const raw = await prisma.expenseEntry.findMany({
        where: { studentId: { in: profileStudentIds } },
        include: { student: { select: { firstName: true, lastName: true } } },
        orderBy: { date: "desc" },
      });
      entries = raw.map((e) => ({ ...e, amount: Number(e.amount) }));
    }
  }

  const pending = isAdmin
    ? await prisma.pendingExpense.findMany({
        where: { status: "PENDING" },
        include: { student: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  // Rejected entries stay visible (with the reason) so the enterer doesn't re-key them blindly.
  // Enterers see their own; approvers/admin see everyone's.
  const rejected = isAdmin
    ? await prisma.pendingExpense.findMany({
        where: {
          status: "DENIED",
          ...(can(session.user.role, "approveExpenses") ? {} : { enteredBy: session.user.name }),
        },
        include: { student: { select: { firstName: true, lastName: true } } },
        orderBy: { reviewedAt: "desc" },
        take: 20,
      })
    : [];

  const total = entries.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Expenses</h2>
        <p className="text-sm text-slate-400">Track expenses charged to your students&apos; accounts.</p>
      </div>

      {canEnter && <ExpenseForm students={students} />}
      {isParent && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          Expenses are recorded when a fund request is approved.{" "}
          <Link href="/request-funds" className="text-cyan-400 underline hover:text-cyan-300">Submit a fund request</Link> to have a purchase approved.
        </div>
      )}

      {pending.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-900/20 p-4 space-y-2">
          <p className="text-sm font-medium text-amber-300">
            {pending.length} expense{pending.length !== 1 ? "s" : ""} awaiting vice president / secretary approval
            {can(session.user.role, "approveExpenses") && (
              <>
                {" "}
                <Link href="/admin/expense-approvals" className="underline hover:text-amber-200">Review now →</Link>
              </>
            )}
          </p>
          <ul className="text-sm text-slate-300 space-y-1">
            {pending.map((p) => (
              <li key={p.id}>
                {p.student.firstName} {p.student.lastName} — {p.description} —{" "}
                <span className="text-rose-400">${Number(p.amount).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rejected.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-900/20 p-4 space-y-2">
          <p className="text-sm font-medium text-red-300">Rejected expenses</p>
          <ul className="space-y-2 text-sm text-slate-300">
            {rejected.map((r) => (
              <li key={r.id}>
                {r.student.firstName} {r.student.lastName} — {r.description} —{" "}
                <span className="text-rose-400">${Number(r.amount).toFixed(2)}</span>
                <span className="block text-xs text-slate-400">
                  Rejected by {r.reviewedBy ?? "—"}
                  {r.reviewedAt ? ` on ${new Date(r.reviewedAt).toLocaleDateString()}` : ""}
                  {r.notes ? ` — ${r.notes}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-slate-700 bg-slate-900/70 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <p className="text-sm font-medium text-slate-300">
            {entries.length} entr{entries.length === 1 ? "y" : "ies"}
          </p>
          <p className="text-sm font-semibold text-rose-400">
            Total: ${total.toFixed(2)}
          </p>
        </div>
        {entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No expense entries yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                    {new Date(entry.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {entry.student.firstName} {entry.student.lastName}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{entry.description}</td>
                  <td className="px-4 py-3 text-right font-medium text-rose-400">
                    ${entry.amount.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
