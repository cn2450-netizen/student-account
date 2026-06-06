import { requirePermission } from "@/lib/secure-page";
import { prisma } from "@/lib/prisma";
import { UnlockAccountButton } from "@/components/unlock-account-button";

export default async function LockedAccountsPage() {
  await requirePermission("unlockAccounts");

  const locked = await prisma.user.findMany({
    where: { permanentLock: true },
    select: {
      id: true,
      username: true,
      role: true,
      lockoutCount: true,
      updatedAt: true,
      profile: {
        select: { firstName: true, lastName: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Locked Accounts</h2>
        <p className="mt-1 text-sm text-slate-400">
          Accounts locked after repeated failed login attempts. Unlocking requires a password
          change on next login.
        </p>
      </div>

      {locked.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-6 py-10 text-center">
          <p className="text-sm text-slate-500">No permanently locked accounts.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Username</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Lockout Count</th>
                <th className="px-4 py-3 text-left">Locked At</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {locked.map((u) => {
                const displayName = u.profile
                  ? `${u.profile.firstName} ${u.profile.lastName}`
                  : u.username;
                return (
                  <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 text-slate-200 font-medium">{displayName}</td>
                    <td className="px-4 py-3 text-slate-400">{u.username}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{u.lockoutCount}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(u.updatedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <UnlockAccountButton userId={u.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
