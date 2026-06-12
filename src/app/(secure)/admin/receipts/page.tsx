import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/secure-page";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { purgeReceiptsOlderThan5Years } from "@/lib/email";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams?: { year?: string; type?: string };
}) {
  const user = await requireAuth();
  if (!can(user.role, "fundRequests") && !can(user.role, "allFunds")) redirect("/dashboard");

  const year    = parseInt(searchParams?.year ?? String(CURRENT_YEAR), 10);
  const typeFilter = searchParams?.type ?? "all";

  const from = new Date(year, 0, 1);
  const to   = new Date(year + 1, 0, 1);

  const receipts = await prisma.emailReceipt.findMany({
    where: {
      sentAt: { gte: from, lt: to },
      ...(typeFilter !== "all" ? { type: typeFilter } : {}),
    },
    orderBy: { sentAt: "desc" },
  });

  const depositCount  = receipts.filter((r) => r.type === "deposit").length;
  const approvalCount = receipts.filter((r) => r.type === "approval").length;
  const totalDeposits = receipts
    .filter((r) => r.type === "deposit" && r.amount != null)
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const exportUrl = `/api/receipts/export?year=${year}${typeFilter !== "all" ? `&type=${typeFilter}` : ""}`;
  const canPurge = can(user.role, "settings");

  async function runPurge() {
    "use server";
    await purgeReceiptsOlderThan5Years();
    redirect(`/admin/receipts?year=${year}&type=${typeFilter}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Email Receipts</h2>
          <p className="mt-1 text-sm text-slate-400">
            {receipts.length} receipt{receipts.length !== 1 ? "s" : ""} in {year}
            {typeFilter === "deposit" ? ` — deposit total: $${totalDeposits.toFixed(2)}` : ""}
          </p>
        </div>
        <a
          href={exportUrl}
          className="no-print rounded-2xl bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-600"
        >
          Export CSV
        </a>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Year */}
        <form method="get" className="flex items-center gap-2">
          {typeFilter !== "all" && <input type="hidden" name="type" value={typeFilter} />}
          <label className="text-sm text-slate-400">Year</label>
          <select
            name="year"
            defaultValue={year}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-cyan-500/70"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button type="submit" className="rounded-xl bg-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-600">
            Go
          </button>
        </form>

        {/* Type tabs */}
        <div className="flex rounded-xl border border-slate-700 overflow-hidden text-sm">
          {(["all", "deposit", "approval"] as const).map((t) => (
            <Link
              key={t}
              href={`/admin/receipts?year=${year}&type=${t}`}
              className={`px-3 py-1.5 capitalize transition ${
                typeFilter === t
                  ? "bg-cyan-500 text-slate-950 font-semibold"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {t}
            </Link>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Deposits</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-400">{depositCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Deposit Total</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-400">${totalDeposits.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Approvals</p>
          <p className="mt-1 text-2xl font-semibold text-cyan-400">{approvalCount}</p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/70 overflow-hidden">
        {receipts.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            No receipts found for {year}{typeFilter !== "all" ? ` (${typeFilter})` : ""}.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-center">Sent</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {receipts.map((r) => (
                <tr key={r.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                    {new Date(r.sentAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.type === "deposit"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-cyan-500/15 text-cyan-400"
                      }`}
                    >
                      {r.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-100">{r.toName}</p>
                    <p className="text-xs text-slate-500">{r.toEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{r.studentName ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium text-emerald-400">
                    {r.amount != null ? `$${Number(r.amount).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.emailSent ? (
                      <span className="text-emerald-400" title="Email sent">✓</span>
                    ) : (
                      <span className="text-slate-600" title="Email not sent">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/receipts/${r.id}`}
                      className="text-xs text-cyan-400 hover:text-cyan-300"
                    >
                      View / Print
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-600">
          Receipts are retained for 5 years. Records shown: {receipts.length}.
        </p>
        {canPurge && (
          <form action={runPurge}>
            <button
              type="submit"
              className="text-xs text-rose-500 hover:text-rose-400 transition"
              title="Permanently delete receipt records older than 5 years"
            >
              Purge records older than 5 years
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
