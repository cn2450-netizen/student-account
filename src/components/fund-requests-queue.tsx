"use client";

import { useState, useTransition } from "react";
import { approveFundRequest, denyFundRequest } from "@/app/actions";

type FundRequest = {
  id: string;
  description: string;
  amount: number;
  requestedAt: Date;
  notes: string | null;
  student: { firstName: string; lastName: string };
  parentName: string;
  currentBalance: number;
};

export function FundRequestsQueue({ requests }: { requests: FundRequest[] }) {
  const [isPending, startTransition] = useTransition();
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyNotes, setDenyNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleApprove = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await approveFundRequest(id);
      if (result.error) setError(result.error);
    });
  };

  const handleDenySubmit = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await denyFundRequest(id, denyNotes);
      if (result.error) {
        setError(result.error);
      } else {
        setDenyingId(null);
        setDenyNotes("");
      }
    });
  };

  if (requests.length === 0) {
    return (
      <p className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-8 text-center text-sm text-slate-500">
        No pending fund requests.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-400">{error}</p>
      )}

      {requests.map((r) => (
        <div key={r.id} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-100">{r.description}</p>
              <p className="text-sm text-slate-400">
                {r.student.firstName} {r.student.lastName} — Parent: {r.parentName}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Submitted {new Date(r.requestedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="text-right space-y-0.5">
              <p className="text-lg font-semibold text-cyan-300">${r.amount.toFixed(2)}</p>
              <p className="text-xs text-slate-500">
                Balance: <span className={r.currentBalance >= 0 ? "text-slate-300" : "text-amber-400"}>${r.currentBalance.toFixed(2)}</span>
              </p>
              <p className="text-xs text-slate-500">
                After approval:{" "}
                <span className={(r.currentBalance - r.amount) >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  ${(r.currentBalance - r.amount).toFixed(2)}
                </span>
              </p>
            </div>
          </div>

          {denyingId === r.id ? (
            <div className="space-y-2">
              <label className="block text-sm text-slate-300">
                Reason for denial <span className="text-red-400 font-semibold">*</span>
                <span className="ml-1 text-xs text-slate-500">(required — shown to the parent)</span>
              </label>
              <textarea
                rows={2}
                value={denyNotes}
                onChange={(e) => setDenyNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-red-400/40 focus:ring"
                placeholder="Explain why this request is being denied…"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleDenySubmit(r.id)}
                  disabled={isPending || !denyNotes.trim()}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  Confirm Denial
                </button>
                <button
                  onClick={() => { setDenyingId(null); setDenyNotes(""); }}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => handleApprove(r.id)}
                disabled={isPending}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => setDenyingId(r.id)}
                disabled={isPending}
                className="rounded-lg border border-red-700 px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/30 disabled:opacity-50"
              >
                Deny
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
