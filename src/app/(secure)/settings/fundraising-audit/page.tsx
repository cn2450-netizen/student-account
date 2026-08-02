import { requirePermission } from "@/lib/secure-page";
import { prisma } from "@/lib/prisma";

export default async function FundraisingAuditPage() {
  await requirePermission("settings");

  const raw = await prisma.fundraisingEntryEdit.findMany({
    include: {
      entry: {
        select: {
          student: {
            select: {
              firstName: true,
              lastName: true,
              profile: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
    orderBy: { editedAt: "desc" },
    take: 200,
  });

  const edits = raw.map((e) => ({
    ...e,
    previousAmount: Number(e.previousAmount),
    newAmount: Number(e.newAmount),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Fundraising Correction Log</h2>
        <p className="mt-1 text-sm text-slate-400">
          Full audit trail of every correction made to a fundraising (deposit) entry after the fact —
          who, what changed, why, and when.
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/70 overflow-hidden">
        {edits.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">No corrections have been made.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Date/Time</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Edited By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {edits.map((e) => {
                const descriptionChanged = e.previousDescription !== e.newDescription;
                const amountChanged = e.previousAmount !== e.newAmount;
                return (
                  <tr key={e.id} className="hover:bg-slate-800/40 transition align-top">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {new Date(e.editedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-100 whitespace-nowrap">
                      {e.entry.student.firstName} {e.entry.student.lastName}
                      <p className="text-xs text-slate-500">
                        Parent: {e.entry.student.profile.firstName} {e.entry.student.profile.lastName}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {descriptionChanged ? (
                        <span>
                          <span className="text-slate-500 line-through">{e.previousDescription}</span>
                          {" → "}
                          <span className="text-slate-100">{e.newDescription}</span>
                        </span>
                      ) : (
                        <span className="text-slate-500">{e.newDescription}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {amountChanged ? (
                        <span>
                          <span className="text-rose-400 line-through">${e.previousAmount.toFixed(2)}</span>
                          {" → "}
                          <span className="text-emerald-400 font-medium">${e.newAmount.toFixed(2)}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">${e.newAmount.toFixed(2)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-xs">{e.reason}</td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{e.editedBy}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
