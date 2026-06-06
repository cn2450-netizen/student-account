import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login");

  const isAdmin = can(session.user.role, "admin");

  if (isAdmin) {
    const [pendingCount, totalParents, totalStudents, totalFundraising, totalExpenses] =
      await Promise.all([
        prisma.accountRequest.count({ where: { status: "PENDING" } }),
        prisma.parentProfile.count(),
        prisma.student.count(),
        prisma.fundraisingEntry.aggregate({ _sum: { amount: true } }),
        prisma.expenseEntry.aggregate({ _sum: { amount: true } }),
      ]);

    const raised = Number(totalFundraising._sum.amount ?? 0);
    const spent = Number(totalExpenses._sum.amount ?? 0);

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Admin Dashboard</h2>
          <p className="text-sm text-slate-400">System-wide overview</p>
        </div>

        {pendingCount > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-900/20 p-4">
            <p className="text-sm font-medium text-amber-300">
              {pendingCount} account request{pendingCount !== 1 ? "s" : ""} awaiting approval.{" "}
              <a href="/admin/approvals" className="underline hover:text-amber-200">
                Review now →
              </a>
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Pending Approvals" value={pendingCount} highlight={pendingCount > 0} />
          <StatCard label="Active Parents" value={totalParents} />
          <StatCard label="Total Students" value={totalStudents} />
          <StatCard label="Net Balance" value={`$${(raised - spent).toFixed(2)}`} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Total Fundraising" value={`$${raised.toFixed(2)}`} />
          <StatCard label="Total Expenses" value={`$${spent.toFixed(2)}`} />
        </div>
      </div>
    );
  }

  // Staff dashboard (Treasurer / Fundraising Manager)
  const isStaff = can(session.user.role, "allStudents") && !isAdmin;
  if (isStaff) {
    const [totalStudents, totalFundraising, totalExpenses, pendingRequests] = await Promise.all([
      prisma.student.count(),
      prisma.fundraisingEntry.aggregate({ _sum: { amount: true } }),
      prisma.expenseEntry.aggregate({ _sum: { amount: true } }),
      can(session.user.role, "fundRequests")
        ? prisma.fundRequest.count({ where: { status: "PENDING" } })
        : Promise.resolve(0),
    ]);

    const raised = Number(totalFundraising._sum.amount ?? 0);
    const spent = Number(totalExpenses._sum.amount ?? 0);

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Dashboard</h2>
          <p className="text-sm text-slate-400 capitalize">
            {session.user.role.replace(/_/g, " ").toLowerCase()} overview
          </p>
        </div>

        {pendingRequests > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-900/20 p-4">
            <p className="text-sm font-medium text-amber-300">
              {pendingRequests} fund request{pendingRequests !== 1 ? "s" : ""} awaiting review.{" "}
              <a href="/admin/fund-requests" className="underline hover:text-amber-200">
                Review now →
              </a>
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Students" value={totalStudents} />
          <StatCard label="Total Fundraising" value={`$${raised.toFixed(2)}`} />
          <StatCard label="Total Expenses" value={`$${spent.toFixed(2)}`} />
          <StatCard label="Net Balance" value={`$${(raised - spent).toFixed(2)}`} />
        </div>
      </div>
    );
  }

  // Parent dashboard
  const profile = await prisma.parentProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      students: {
        include: {
          fundraising: true,
          expenses: true,
        },
        orderBy: { firstName: "asc" },
      },
    },
  });

  if (!profile) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <p className="text-sm text-slate-400">Your profile is being set up. Please check back soon.</p>
      </div>
    );
  }

  const totalRaised = profile.students.reduce(
    (sum, s) => sum + s.fundraising.reduce((a, f) => a + Number(f.amount), 0),
    0,
  );
  const totalSpent = profile.students.reduce(
    (sum, s) => sum + s.expenses.reduce((a, e) => a + Number(e.amount), 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">
          Welcome, {profile.firstName}!
        </h2>
        <p className="text-sm text-slate-400">Here&apos;s a summary of your students&apos; accounts.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Students" value={profile.students.length} />
        <StatCard label="Total Fundraising" value={`$${totalRaised.toFixed(2)}`} />
        <StatCard label="Total Expenses" value={`$${totalSpent.toFixed(2)}`} />
      </div>

      {profile.students.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-6 text-center text-sm text-slate-400">
          No students yet.{" "}
          <a href="/students" className="text-cyan-400 underline hover:text-cyan-300">
            Add a student →
          </a>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profile.students.map((student) => {
            const raised = student.fundraising.reduce((a, f) => a + Number(f.amount), 0);
            const spent = student.expenses.reduce((a, e) => a + Number(e.amount), 0);
            return (
              <div
                key={student.id}
                className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 space-y-2"
              >
                <p className="font-medium text-slate-100">
                  {student.firstName} {student.lastName}
                </p>
                {student.grade && (
                  <p className="text-xs text-slate-500">Grade: {student.grade}</p>
                )}
                <div className="text-sm text-slate-300 space-y-1">
                  <p>
                    Raised:{" "}
                    <span className="font-semibold text-emerald-400">${raised.toFixed(2)}</span>
                  </p>
                  <p>
                    Spent:{" "}
                    <span className="font-semibold text-rose-400">${spent.toFixed(2)}</span>
                  </p>
                  <p>
                    Balance:{" "}
                    <span
                      className={`font-semibold ${raised - spent >= 0 ? "text-cyan-400" : "text-amber-400"}`}
                    >
                      ${(raised - spent).toFixed(2)}
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? "border-amber-500/40 bg-amber-900/20"
          : "border-slate-700 bg-slate-900/70"
      }`}
    >
      <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${highlight ? "text-amber-300" : "text-slate-100"}`}>
        {value}
      </p>
    </div>
  );
}
