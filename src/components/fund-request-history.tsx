"use client";

import { useState } from "react";

const STATUS_STYLES: Record<string, string> = {
  PENDING:  "bg-amber-900/40 text-amber-300",
  APPROVED: "bg-emerald-900/40 text-emerald-300",
  DENIED:   "bg-red-900/40 text-red-400",
};

type FundRequest = {
  id: string;
  description: string;
  amount: number;
  requestedAt: Date;
  status: string;
  notes: string | null;
  student: { firstName: string; lastName: string };
  reviewedBy?: string | null;
};

export function FundRequestHistory({
  requests,
  showReviewedBy = false,
}: {
  requests: FundRequest[];
  showReviewedBy?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (requests.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-slate-500">No requests submitted yet.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-800">
          <th className="px-4 py-3">Date</th>
          <th className="px-4 py-3">Student</th>
          <th className="px-4 py-3">Description</th>
          <th className="px-4 py-3 text-right">Amount</th>
          <th className="px-4 py-3 text-center">Status</th>
          {showReviewedBy && <th className="px-4 py-3">Reviewed By</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {requests.map((r) => {
          const isDenied = r.status === "DENIED" && !!r.notes;
          const isOpen = expanded.has(r.id);

          return (
            <>
              <tr
                key={r.id}
                onClick={isDenied ? () => toggle(r.id) : undefined}
                className={isDenied ? "cursor-pointer hover:bg-slate-800/40" : "hover:bg-slate-800/40"}
              >
                <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                  {new Date(r.requestedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {r.student.firstName} {r.student.lastName}
                </td>
                <td className="px-4 py-3 text-slate-300">{r.description}</td>
                <td className="px-4 py-3 text-right font-medium text-slate-200">
                  ${r.amount.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}>
                      {r.status}
                    </span>
                    {isDenied && (
                      <svg
                        className={`h-3.5 w-3.5 text-red-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </div>
                </td>
                {showReviewedBy && (
                  <td className="px-4 py-3 text-slate-400 text-xs">{r.reviewedBy ?? "—"}</td>
                )}
              </tr>

              {isDenied && isOpen && (
                <tr key={`${r.id}-reason`} className="bg-red-950/20">
                  <td colSpan={showReviewedBy ? 6 : 5} className="px-4 pb-3 pt-0">
                    <div className="rounded-lg border border-red-700/40 bg-red-900/20 px-3 py-2">
                      <p className="text-xs text-red-300">
                        <span className="font-semibold">Reason for denial: </span>
                        {r.notes}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </>
          );
        })}
      </tbody>
    </table>
  );
}
