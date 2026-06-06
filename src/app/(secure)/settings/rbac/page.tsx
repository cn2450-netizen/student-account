import { requirePermission } from "@/lib/secure-page";

const ROLES = [
  {
    role: "ADMIN",
    permissions: [
      "Dashboard",
      "All Students",
      "All Fundraising (add entries)",
      "All Expenses",
      "Fund Request Approvals",
      "Account Approvals",
      "Unlock Locked Accounts",
      "Settings",
    ],
  },
  {
    role: "PRESIDENT",
    permissions: [
      "Dashboard",
      "All Students",
      "All Fundraising",
      "Fund Request Approvals",
      "Account Approvals",
      "Unlock Locked Accounts",
    ],
  },
  {
    role: "TREASURER",
    permissions: [
      "Dashboard",
      "All Students",
      "All Fundraising",
      "Fund Request Approvals",
      "Account Approvals",
    ],
  },
  {
    role: "FUNDRAISING_MANAGER",
    permissions: [
      "Dashboard",
      "Fundraisers (configure)",
      "All Students",
      "All Fundraising (add entries)",
    ],
  },
  {
    role: "BOARD_MEMBER",
    permissions: [
      "Dashboard",
      "All Students (read-only)",
    ],
  },
  {
    role: "PARENT",
    permissions: [
      "Dashboard",
      "My Students",
      "View Fundraising & Expenses",
      "Submit Fund Requests",
    ],
  },
];

export default async function SettingsRbacPage() {
  await requirePermission("admin");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Permissions</h2>
        <p className="mt-1 text-sm text-slate-400">
          Role-based access control overview for each user role.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {ROLES.map(({ role, permissions }) => (
          <div
            key={role}
            className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5"
          >
            <h3 className="mb-3 font-semibold text-cyan-300">{role}</h3>
            <ul className="space-y-1">
              {permissions.map((perm) => (
                <li key={perm} className="flex items-center gap-2 text-sm text-slate-300">
                  <span className="text-emerald-400">✓</span>
                  {perm}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
