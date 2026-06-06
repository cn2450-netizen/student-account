import { requirePermission } from "@/lib/secure-page";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UsersTable } from "@/components/users-table";
import { CreateStaffUserForm } from "@/components/create-staff-user-form";

export default async function SettingsUsersPage() {
  const session = await requirePermission("admin");
  const currentSession = await getCurrentSession();

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      role: true,
      forcePasswordChange: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">User Accounts</h2>
        <p className="mt-1 text-sm text-slate-400">
          Manage user accounts, reset passwords, and change roles.
        </p>
      </div>

      <CreateStaffUserForm />

      <UsersTable users={users} currentUserId={currentSession!.user.id} />
    </div>
  );
}
