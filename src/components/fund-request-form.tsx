"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitFundRequest } from "@/app/actions";

type Student = { id: string; firstName: string; lastName: string };

export function FundRequestForm({ students }: { students: Student[] }) {
  const [state, action, pending] = useActionState(submitFundRequest, { error: undefined, success: undefined });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={action} className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
      <h3 className="font-semibold text-slate-100">New Fund Request</h3>

      {state.error && (
        <p className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-400">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-900/30 px-3 py-2 text-sm text-emerald-300">
          Request submitted — a treasurer will review it shortly.
        </p>
      )}

      <div>
        <label className="mb-1 block text-sm text-slate-300">Student</label>
        <select
          name="studentId"
          required
          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-cyan-400/40 focus:ring"
        >
          <option value="">Select a student…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.firstName} {s.lastName}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-300">What will the funds be used for?</label>
        <textarea
          name="description"
          required
          rows={3}
          placeholder="e.g. Field trip supplies, uniform purchase…"
          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-cyan-400/40 focus:ring"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-300">Amount Requested ($)</label>
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          placeholder="0.00"
          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-cyan-400/40 focus:ring"
        />
      </div>

      <button
        type="submit"
        disabled={pending || students.length === 0}
        className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit Request"}
      </button>

      {students.length === 0 && (
        <p className="text-center text-xs text-slate-500">Add a student first before submitting a request.</p>
      )}
    </form>
  );
}
