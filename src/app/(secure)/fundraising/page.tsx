import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { FundraisingForm } from "@/components/fundraising-form";

export default async function FundraisingPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login");

  const isAdmin = can(session.user.role, "allFunds");
  const isParent = session.user.role === "PARENT";

  // Load students for the current user (or all students for admin)
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
    const raw = await prisma.fundraisingEntry.findMany({
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
      const raw = await prisma.fundraisingEntry.findMany({
        where: { studentId: { in: profileStudentIds } },
        include: { student: { select: { firstName: true, lastName: true } } },
        orderBy: { date: "desc" },
      });
      entries = raw.map((e) => ({ ...e, amount: Number(e.amount) }));
    }
  }

  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  const fundraisers = isAdmin
    ? await prisma.fundraiser.findMany({ where: { active: true }, orderBy: { name: "asc" } })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Fundraising</h2>
        <p className="text-sm text-slate-400">Track fundraising amounts for your students.</p>
      </div>

      {isAdmin && <FundraisingForm students={students} fundraisers={fundraisers} />}
      {isParent && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          Fundraising entries are recorded by the treasurer.{" "}
          <Link href="/request-funds" className="text-cyan-400 underline hover:text-cyan-300">Request funds</Link> if you need to make a purchase.
        </div>
      )}

      <div className="rounded-xl border border-slate-700 bg-slate-900/70 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <p className="text-sm font-medium text-slate-300">
            {entries.length} entr{entries.length === 1 ? "y" : "ies"}
          </p>
          <p className="text-sm font-semibold text-emerald-400">
            Total: ${total.toFixed(2)}
          </p>
        </div>
        {entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No fundraising entries yet.</p>
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
                  <td className="px-4 py-3 text-right font-medium text-emerald-400">
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
