"use client";

import { useActionState } from "react";
import { addFundraisingEntry } from "@/app/actions";

type Student = { id: string; firstName: string; lastName: string };
type Fundraiser = { id: string; name: string };

export function FundraisingForm({ students, fundraisers }: { students: Student[]; fundraisers: Fundraiser[] }) {
  const [state, action, pending] = useActionState(addFundraisingEntry, { error: undefined, success: undefined });

  if (students.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-400">
        No students found. Add a student first.
      </div>
    );
  }

  return (
    <form action={action} className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
      <p className="mb-3 text-sm font-medium text-slate-300">Add Fundraising Entry</p>
      {state.error ? (
        <p className="mb-3 rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-400">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="mb-3 rounded-lg bg-emerald-900/40 px-3 py-2 text-sm text-emerald-400">
          Entry added.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-36">
          <label className="mb-1 block text-xs text-slate-400">Student</label>
          <select
            name="studentId"
            required
            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 text-sm outline-none ring-cyan-400/40 focus:ring"
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName}
              </option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <label className="mb-1 block text-xs text-slate-400">Amount ($)</label>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 text-sm outline-none ring-cyan-400/40 focus:ring"
          />
        </div>
        <div className="flex-1 min-w-40">
          <label className="mb-1 block text-xs text-slate-400">Fundraiser</label>
          {fundraisers.length === 0 ? (
            <p className="rounded-lg border border-amber-700/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-400">
              No fundraisers configured.{" "}
              <a href="/admin/fundraisers" className="underline hover:text-amber-300">Add one first →</a>
            </p>
          ) : (
            <select
              name="description"
              required
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 text-sm outline-none ring-cyan-400/40 focus:ring"
            >
              {fundraisers.map((f) => (
                <option key={f.id} value={f.name}>{f.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="w-40">
          <label className="mb-1 block text-xs text-slate-400">Date</label>
          <input
            name="date"
            type="date"
            defaultValue={new Date().toISOString().split("T")[0]}
            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 text-sm outline-none ring-cyan-400/40 focus:ring"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add Entry"}
          </button>
        </div>
      </div>
    </form>
  );
}
