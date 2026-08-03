import { requirePermission } from "@/lib/secure-page";
import { prisma } from "@/lib/prisma";
import { GraduatedStudentsList } from "@/components/graduated-students-list";
import { AdvanceGradesButton } from "@/components/advance-grades-button";

export default async function AdminGraduatedPage() {
  await requirePermission("fundRequests");

  const [raw, lastAdvancement, dateConfig] = await Promise.all([
    prisma.student.findMany({
      where: { graduated: true },
      include: {
        profile: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            students: {
              where: { graduated: false },
              select: { id: true, firstName: true, lastName: true },
              orderBy: { firstName: "asc" },
            },
          },
        },
        fundraising: { select: { amount: true } },
        expenses: { select: { amount: true } },
      },
      orderBy: [{ transferApproved: "asc" }, { graduatedAt: "desc" }],
    }),
    prisma.appConfig.findUnique({ where: { key: "gradeAdvancementYear" } }),
    prisma.appConfig.findUnique({ where: { key: "gradeAdvancementDate" } }),
  ]);

  const [configMonth, configDay] = (dateConfig?.value ?? "7/1").split("/").map(Number);
  const advancementLabel = new Date(2000, configMonth - 1, configDay).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });

  const students = raw.map((s) => {
    const raised = s.fundraising.reduce((sum, e) => sum + Number(e.amount), 0);
    const spent = s.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    return {
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      graduatedAt: s.graduatedAt,
      transferApproved: s.transferApproved,
      transferApprovedAt: s.transferApprovedAt,
      transferApprovedBy: s.transferApprovedBy,
      transferNotes: s.transferNotes,
      parent: s.profile ? { firstName: s.profile.firstName, lastName: s.profile.lastName, phone: s.profile.phone } : null,
      siblings: s.profile?.students ?? [],
      raised,
      spent,
      balance: raised - spent,
    };
  });

  const grandTotal = students.reduce((sum, s) => sum + s.balance, 0);

  // Group by graduation year (most recent class first). graduatedAt should
  // always be set alongside graduated=true, but bucket any legacy/odd rows
  // under "Unknown" rather than dropping them silently.
  const yearGroups = new Map<number | null, typeof students>();
  for (const s of students) {
    const year = s.graduatedAt ? new Date(s.graduatedAt).getFullYear() : null;
    if (!yearGroups.has(year)) yearGroups.set(year, []);
    yearGroups.get(year)!.push(s);
  }
  const sortedYears = [...yearGroups.keys()].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Graduated Students</h2>
        <p className="mt-1 text-sm text-slate-400">
          Review account balances for graduated students and approve fund transfers.
        </p>
      </div>

      {/* Grade advancement controls */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 space-y-2">
        <p className="text-sm font-medium text-slate-300">Grade Advancement</p>
        <p className="text-xs text-slate-500">
          Advances all active students up one grade on {advancementLabel}. Grade 12 students are moved to this
          graduated list.{" "}
          {lastAdvancement
            ? `Last run: school year ${lastAdvancement.value}.`
            : "Has not been run yet."}
        </p>
        <AdvanceGradesButton advancementDate={advancementLabel} />
      </div>

      {students.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-6 py-10 text-center text-sm text-slate-500">
          No graduated students yet. Grades advance automatically on {advancementLabel} each year.
        </div>
      ) : (
        <>
          {/* Overall total across every graduated class */}
          <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-5 py-4 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-300">
              Total held across all graduated students ({students.length})
            </p>
            <p className={`text-lg font-bold ${grandTotal >= 0 ? "text-cyan-300" : "text-amber-400"}`}>
              ${grandTotal.toFixed(2)}
            </p>
          </div>

          {sortedYears.map((year) => {
            const group = yearGroups.get(year)!;
            const yearTotal = group.reduce((sum, s) => sum + s.balance, 0);
            const pending = group.filter((s) => !s.transferApproved);
            const approved = group.filter((s) => s.transferApproved);

            return (
              <div key={year ?? "unknown"} className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="text-base font-semibold text-slate-100">
                    Class of {year ?? "Unknown Year"}
                  </h3>
                  <p className={`text-sm font-semibold ${yearTotal >= 0 ? "text-cyan-300" : "text-amber-400"}`}>
                    ${yearTotal.toFixed(2)}
                  </p>
                </div>

                {pending.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-amber-400">
                      Pending Transfer Approval ({pending.length})
                    </h4>
                    <GraduatedStudentsList students={pending} />
                  </div>
                )}

                {approved.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-emerald-400">
                      Transfer Approved ({approved.length})
                    </h4>
                    <GraduatedStudentsList students={approved} readOnly />
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
