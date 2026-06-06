import { requirePermission } from "@/lib/secure-page";
import { prisma } from "@/lib/prisma";
import { FundRequestsQueue } from "@/components/fund-requests-queue";
import { FundRequestHistory } from "@/components/fund-request-history";

export default async function FundRequestsPage() {
  await requirePermission("fundRequests");

  const pending = await prisma.fundRequest.findMany({
    where: { status: "PENDING" },
    include: {
      student: {
        select: {
          firstName: true,
          lastName: true,
          profile: { select: { firstName: true, lastName: true } },
          fundraising: { select: { amount: true } },
          expenses: { select: { amount: true } },
        },
      },
    },
    orderBy: { requestedAt: "asc" },
  });

  const history = await prisma.fundRequest.findMany({
    where: { status: { not: "PENDING" } },
    include: {
      student: {
        select: {
          firstName: true,
          lastName: true,
          profile: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { reviewedAt: "desc" },
    take: 50,
  });

  const toQueueItem = (r: typeof pending[number]) => {
    const raised = r.student.fundraising.reduce((sum, e) => sum + Number(e.amount), 0);
    const spent = r.student.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    return {
      id: r.id,
      description: r.description,
      amount: Number(r.amount),
      requestedAt: r.requestedAt,
      notes: r.notes,
      student: { firstName: r.student.firstName, lastName: r.student.lastName },
      parentName: `${r.student.profile.firstName} ${r.student.profile.lastName}`,
      currentBalance: raised - spent,
    };
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Fund Requests</h2>
        <p className="mt-1 text-sm text-slate-400">
          Review and approve or deny parent fund requests. Approved requests automatically create an expense entry.
        </p>
      </div>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Pending ({pending.length})
        </h3>
        <FundRequestsQueue requests={pending.map(toQueueItem)} />
      </section>

      {history.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Recent History
          </h3>
          <div className="rounded-2xl border border-slate-700 overflow-hidden">
            <FundRequestHistory
              showReviewedBy
              requests={history.map((r) => ({
                id: r.id,
                description: r.description,
                amount: Number(r.amount),
                requestedAt: r.requestedAt,
                status: r.status,
                notes: r.notes,
                reviewedBy: r.reviewedBy,
                student: { firstName: r.student.firstName, lastName: r.student.lastName },
              }))}
            />
          </div>
        </section>
      )}
    </div>
  );
}
