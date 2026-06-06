"use client";

import { useActionState } from "react";
import { addExpenseEntry } from "@/app/actions";

type Student = { id: string; firstName: string; lastName: string };

export function ExpenseForm({ students }: { students: Student[] }) {
  const [state, action, pending] = useActionState(addExpenseEntry, { error: undefined, success: undefined });

  if (students.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-400">
        No students found. Add a student first.
      </div>
    );
  }

  return (
    <form action={action} className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
      <p className="mb-3 text-sm font-medium text-slate-300">Add Expense Entry</p>
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
          <label className="mb-1 block text-xs text-slate-400">Description</label>
          <input
            name="description"
            required
            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 text-sm outline-none ring-cyan-400/40 focus:ring"
          />
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
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-500 disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add Entry"}
          </button>
        </div>
      </div>
    </form>
  );
}
