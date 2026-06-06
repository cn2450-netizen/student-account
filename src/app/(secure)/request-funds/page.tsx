import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { FundRequestForm } from "@/components/fund-request-form";
import { FundRequestHistory } from "@/components/fund-request-history";

export default async function RequestFundsPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "submitRequests")) redirect("/dashboard");

  const profile = await prisma.parentProfile.findUnique({
    where: { userId: session.user.id },
    include: { students: { select: { id: true, firstName: true, lastName: true } } },
  });

  const students = profile?.students ?? [];

  const requests = profile
    ? await prisma.fundRequest.findMany({
        where: { studentId: { in: students.map((s) => s.id) } },
        include: { student: { select: { firstName: true, lastName: true } } },
        orderBy: { requestedAt: "desc" },
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Request Funds</h2>
        <p className="mt-1 text-sm text-slate-400">
          Submit a request to use fundraising funds for a specific purpose. A treasurer will review
          and approve or deny each request.
        </p>
      </div>

      <FundRequestForm students={students} />

      {/* Request history */}
      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 overflow-hidden">
        <div className="border-b border-slate-700 px-4 py-3">
          <p className="text-sm font-medium text-slate-300">Your Requests</p>
        </div>
        {requests.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No requests submitted yet.</p>
        ) : (
          <FundRequestHistory
            requests={requests.map((r) => ({
              id: r.id,
              description: r.description,
              amount: Number(r.amount),
              requestedAt: r.requestedAt,
              status: r.status,
              notes: r.notes,
              student: { firstName: r.student.firstName, lastName: r.student.lastName },
            }))}
          />
        )}
      </div>
    </div>
  );
}
