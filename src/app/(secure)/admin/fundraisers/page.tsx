import { requireAuth } from "@/lib/secure-page";
import { redirect } from "next/navigation";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { FundraiserManageForm } from "@/components/fundraiser-manage-form";

export default async function FundraisersPage() {
  const user = await requireAuth();
  if (!can(user.role, "manageFundraising")) redirect("/dashboard");

  const fundraisers = await prisma.fundraiser.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Fundraisers</h2>
        <p className="mt-1 text-sm text-slate-400">
          Configure the companies and campaigns available when recording fundraising entries.
        </p>
      </div>

      <FundraiserManageForm fundraisers={fundraisers} />
    </div>
  );
}
