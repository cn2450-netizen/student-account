import { requirePermission } from "@/lib/secure-page";
import { prisma } from "@/lib/prisma";
import { GraduatedStudentsList } from "@/components/graduated-students-list";
import { AdvanceGradesButton } from "@/components/advance-grades-button";

export default async function AdminGraduatedPage() {
  await requirePermission("fundRequests");

  const [raw, lastAdvancement] = await Promise.all([
    prisma.student.findMany({
      where: { graduated: true },
      include: {
        profile: { select: { firstName: true, lastName: true, phone: true } },
        fundraising: { select: { amount: true } },
        expenses: { select: { amount: true } },
      },
      orderBy: [{ transferApproved: "asc" }, { graduatedAt: "desc" }],
    }),
    prisma.appConfig.findUnique({ where: { key: "gradeAdvancementYear" } }),
  ]);

  const students = raw.map((s) => ({
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    graduatedAt: s.graduatedAt,
    transferApproved: s.transferApproved,
    transferApprovedAt: s.transferApprovedAt,
    transferApprovedBy: s.transferApprovedBy,
    transferNotes: s.transferNotes,
    parent: s.profile,
    raised: s.fundraising.reduce((sum, e) => sum + Number(e.amount), 0),
    spent: s.expenses.reduce((sum, e) => sum + Number(e.amount), 0),
  }));

  const pending = students.filter((s) => !s.transferApproved);
  const approved = students.filter((s) => s.transferApproved);

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
          Advances all active students up one grade on July 1. Grade 12 students are moved to this
          graduated list.{" "}
          {lastAdvancement
            ? `Last run: school year ${lastAdvancement.value}.`
            : "Has not been run yet."}
        </p>
        <AdvanceGradesButton />
      </div>

      {students.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-6 py-10 text-center text-sm text-slate-500">
          No graduated students yet. Grades advance automatically on July 1st each year.
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-400">
                Pending Transfer Approval ({pending.length})
              </h3>
              <GraduatedStudentsList students={pending} />
            </div>
          )}

          {approved.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-400">
                Transfer Approved ({approved.length})
              </h3>
              <GraduatedStudentsList students={approved} readOnly />
            </div>
          )}
        </>
      )}
    </div>
  );
}
