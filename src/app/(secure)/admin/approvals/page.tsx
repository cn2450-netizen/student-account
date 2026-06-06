import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/secure-page";
import { prisma } from "@/lib/prisma";
import { ApprovalQueue } from "@/components/approval-queue";

export default async function ApprovalsPage() {
  const user = await requirePermission("approvals");

  const requests = await prisma.accountRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Account Approvals</h2>
        <p className="text-sm text-slate-400">
          Review and approve pending parent account requests.
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
          No pending account requests.
        </div>
      ) : (
        <ApprovalQueue requests={requests} reviewerName={user.name} />
      )}
    </div>
  );
}
