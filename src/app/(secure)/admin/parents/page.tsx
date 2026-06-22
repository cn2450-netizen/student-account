import { requirePermission } from "@/lib/secure-page";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { DeleteParentButton } from "@/components/delete-parent-button";

export default async function AdminParentsPage() {
  const currentUser = await requirePermission("allStudents");
  const canDelete = can(currentUser.role, "admin");

  const parents = await prisma.user.findMany({
    where: { role: "PARENT" },
    select: {
      id: true,
      username: true,
      createdAt: true,
      profile: {
        select: {
          firstName: true,
          lastName: true,
          phone: true,
          students: { select: { id: true, firstName: true, lastName: true, grade: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Registered Parents</h2>
        <p className="mt-1 text-sm text-slate-400">
          {parents.length} parent account{parents.length !== 1 ? "s" : ""} registered
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/70 overflow-hidden">
        {parents.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-500">No parent accounts registered yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Username</th>
                <th className="px-4 py-3 text-left">Phone</th>
                <th className="px-4 py-3 text-left">Students</th>
                <th className="px-4 py-3 text-left">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {parents.map((p) => (
                <tr key={p.id} className="border-b border-slate-800">
                  <td colSpan={5} className="p-0">
                    <details className="group">
                      <summary className="grid gap-4 px-4 py-3 text-left text-slate-200 transition hover:bg-slate-800/40 cursor-pointer items-center sm:grid-cols-[auto_2fr_1fr_1fr_1fr_1fr]">
                        <svg
                          className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-180"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 14l-7 7m0 0l-7-7m7 7V3"
                          />
                        </svg>
                        <span className="font-medium">
                          {p.profile
                            ? `${p.profile.firstName} ${p.profile.lastName}`
                            : <span className="text-slate-500 italic">No profile</span>}
                        </span>
                        <span className="text-slate-400 break-all">{p.username}</span>
                        <span className="text-slate-400">{p.profile?.phone ?? "—"}</span>
                        <span className="text-slate-300">
                          {p.profile?.students.length ? `${p.profile.students.length} student${p.profile.students.length !== 1 ? "s" : ""}` : "None"}
                        </span>
                        <span className="text-slate-500 text-xs">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </span>
                      </summary>

                      <div className="border-t border-slate-700 bg-slate-950/80 px-4 py-4 text-sm text-slate-300">
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="space-y-2">
                            <p className="text-sm font-semibold text-slate-100">Account details</p>
                            <p>
                              <span className="font-medium text-slate-300">Email:</span>{" "}
                              <span className="text-slate-400 break-all">{p.username}</span>
                            </p>
                            <p>
                              <span className="font-medium text-slate-300">Phone:</span>{" "}
                              <span className="text-slate-400">{p.profile?.phone ?? "—"}</span>
                            </p>
                            <p>
                              <span className="font-medium text-slate-300">Created:</span>{" "}
                              <span className="text-slate-400">{new Date(p.createdAt).toLocaleString()}</span>
                            </p>
                            {canDelete && (
                              <div className="pt-2">
                                <DeleteParentButton
                                  userId={p.id}
                                  name={p.profile ? `${p.profile.firstName} ${p.profile.lastName}` : p.username}
                                />
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm font-semibold text-slate-100">Linked students</p>
                            {p.profile?.students.length ? (
                              <ul className="space-y-2">
                                {p.profile.students.map((s) => (
                                  <li key={s.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="font-medium text-slate-100">
                                        {s.firstName} {s.lastName}
                                      </span>
                                      {s.grade ? (
                                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                                          Gr. {s.grade}
                                        </span>
                                      ) : null}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-slate-500 italic">No students linked to this account.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </details>
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
