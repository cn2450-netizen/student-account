import { requirePermission } from "@/lib/secure-page";
import { prisma } from "@/lib/prisma";

export default async function AdminExpensesPage() {
  await requirePermission("admin");

  const raw = await prisma.expenseEntry.findMany({
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
  });

  const entries = raw.map((e) => ({ ...e, amount: Number(e.amount) }));
  const total = entries.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">All Expenses</h2>
        <p className="text-sm text-slate-400">
          {entries.length} entr{entries.length === 1 ? "y" : "ies"} — Total:{" "}
          <span className="text-rose-400 font-semibold">${total.toFixed(2)}</span>
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/70 overflow-hidden">
        {entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No expense entries.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Parent</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                    {new Date(e.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-slate-100">
                    {e.student.firstName} {e.student.lastName}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {e.student.profile.firstName} {e.student.profile.lastName}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{e.description}</td>
                  <td className="px-4 py-3 text-right font-medium text-rose-400">
                    ${e.amount.toFixed(2)}
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
