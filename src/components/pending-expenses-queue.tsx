"use client";

import { useState, useTransition } from "react";
import { approvePendingExpense, rejectPendingExpense } from "@/app/actions";

type PendingExpense = {
  id: string;
  description: string;
  amount: number;
  date: Date;
  enteredBy: string;
  student: { firstName: string; lastName: string };
  currentBalance: number;
};

export function PendingExpensesQueue({ expenses }: { expenses: PendingExpense[] }) {
  const [isPending, startTransition] = useTransition();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleApprove = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await approvePendingExpense(id);
      if (result.error) setError(result.error);
    });
  };

  const handleRejectSubmit = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await rejectPendingExpense(id, rejectNotes);
      if (result.error) {
        setError(result.error);
      } else {
        setRejectingId(null);
        setRejectNotes("");
      }
    });
  };

  if (expenses.length === 0) {
    return (
      <p className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-8 text-center text-sm text-slate-500">
        No expenses awaiting approval.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-400">{error}</p>
      )}

      {expenses.map((x) => (
        <div key={x.id} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-100">{x.description}</p>
              <p className="text-sm text-slate-400">
                {x.student.firstName} {x.student.lastName}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Entered by {x.enteredBy} · dated {new Date(x.date).toLocaleDateString()}
              </p>
            </div>
            <div className="text-right space-y-0.5">
              <p className="text-lg font-semibold text-rose-400">${x.amount.toFixed(2)}</p>
              <p className="text-xs text-slate-500">
                Balance: <span className={x.currentBalance >= 0 ? "text-slate-300" : "text-amber-400"}>${x.currentBalance.toFixed(2)}</span>
              </p>
              <p className="text-xs text-slate-500">
                After approval:{" "}
                <span className={(x.currentBalance - x.amount) >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  ${(x.currentBalance - x.amount).toFixed(2)}
                </span>
              </p>
            </div>
          </div>

          {rejectingId === x.id ? (
            <div className="space-y-2">
              <label className="block text-sm text-slate-300">
                Reason for rejection <span className="text-red-400 font-semibold">*</span>
              </label>
              <textarea
                rows={2}
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-red-400/40 focus:ring"
                placeholder="Explain why this expense is being rejected…"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleRejectSubmit(x.id)}
                  disabled={isPending || !rejectNotes.trim()}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  Confirm Rejection
                </button>
                <button
                  onClick={() => { setRejectingId(null); setRejectNotes(""); }}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => handleApprove(x.id)}
                disabled={isPending}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => setRejectingId(x.id)}
                disabled={isPending}
                className="rounded-lg border border-red-700 px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/30 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
