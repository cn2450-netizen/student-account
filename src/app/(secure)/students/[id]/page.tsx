import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login");

  // Verify the student belongs to this parent
  const profile = await prisma.parentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, students: { select: { id: true } } },
  });

  if (!profile || !profile.students.some((s) => s.id === id)) {
    notFound();
  }

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      fundraising: { orderBy: { date: "desc" } },
      expenses: { orderBy: { date: "desc" } },
    },
  });

  if (!student) notFound();

  const fundraisingTotal = student.fundraising.reduce((sum, e) => sum + Number(e.amount), 0);
  const expensesTotal = student.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const balance = fundraisingTotal - expensesTotal;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/students"
          className="text-sm text-slate-400 hover:text-cyan-400 transition"
        >
          ← My Students
        </Link>
        <span className="text-slate-600">/</span>
        <h2 className="text-xl font-semibold text-slate-100">
          {student.firstName} {student.lastName}
        </h2>
        {student.grade && (
          <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
            Grade {student.grade}
          </span>
        )}
      </div>

      {/* Balance summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-4 text-center">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Fundraising</p>
          <p className="text-xl font-bold text-emerald-400">${fundraisingTotal.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-4 text-center">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Expenses</p>
          <p className="text-xl font-bold text-rose-400">${expensesTotal.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-4 text-center">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Balance</p>
          <p className={`text-xl font-bold ${balance >= 0 ? "text-cyan-400" : "text-rose-400"}`}>
            ${balance.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Fundraising */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">
          Fundraising
        </h3>
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 overflow-hidden">
          {student.fundraising.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No fundraising entries yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {student.fundraising.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {new Date(entry.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{entry.description}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-400">
                      ${Number(entry.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Expenses */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">
          Expenses
        </h3>
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 overflow-hidden">
          {student.expenses.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No expense entries yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {student.expenses.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {new Date(entry.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{entry.description}</td>
                    <td className="px-4 py-3 text-right font-medium text-rose-400">
                      ${Number(entry.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Request funds link */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
        Need to make a purchase?{" "}
        <Link href="/request-funds" className="text-cyan-400 underline hover:text-cyan-300">
          Submit a fund request
        </Link>{" "}
        for treasurer approval.
      </div>
    </div>
  );
}
