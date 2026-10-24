import { requirePermission } from "@/lib/secure-page";
import { prisma } from "@/lib/prisma";
import { PendingExpensesQueue } from "@/components/pending-expenses-queue";

export default async function ExpenseApprovalsPage() {
  await requirePermission("approveExpenses");

  const pending = await prisma.pendingExpense.findMany({
    where: { status: "PENDING" },
    include: {
      student: {
        select: {
          firstName: true,
          lastName: true,
          fundraising: { select: { amount: true } },
          expenses: { select: { amount: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const history = await prisma.pendingExpense.findMany({
    where: { status: { not: "PENDING" } },
    include: { student: { select: { firstName: true, lastName: true } } },
    orderBy: { reviewedAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Expense Approvals</h2>
        <p className="mt-1 text-sm text-slate-400">
          Withdrawals entered by the treasurer. Nothing is charged to a student&apos;s account until it is approved here.
        </p>
      </div>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Pending ({pending.length})
        </h3>
        <PendingExpensesQueue
          expenses={pending.map((p) => {
            const raised = p.student.fundraising.reduce((sum, e) => sum + Number(e.amount), 0);
            const spent = p.student.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
            return {
              id: p.id,
              description: p.description,
              amount: Number(p.amount),
              date: p.date,
              enteredBy: p.enteredBy,
              student: { firstName: p.student.firstName, lastName: p.student.lastName },
              currentBalance: raised - spent,
            };
          })}
        />
      </section>

      {history.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Recent History</h3>
          <div className="rounded-2xl border border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Reviewed</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Entered / Reviewed by</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {h.reviewedAt ? new Date(h.reviewedAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-100">{h.student.firstName} {h.student.lastName}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {h.description}
                      {h.notes && <span className="block text-xs text-slate-500">{h.notes}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{h.enteredBy} / {h.reviewedBy ?? "—"}</td>
                    <td className={`px-4 py-3 ${h.status === "APPROVED" ? "text-emerald-400" : "text-red-400"}`}>
                      {h.status === "APPROVED" ? "Approved" : "Rejected"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">${Number(h.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
