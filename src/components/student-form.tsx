"use client";

import { useActionState } from "react";
import { createStudent } from "@/app/actions";

export function StudentForm() {
  const [state, action, pending] = useActionState(createStudent, { error: undefined, success: undefined });

  return (
    <form
      action={action}
      className="rounded-xl border border-slate-700 bg-slate-900/70 p-4"
    >
      <p className="mb-3 text-sm font-medium text-slate-300">Add New Student</p>
      {state.error ? (
        <p className="mb-3 rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-400">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="mb-3 rounded-lg bg-emerald-900/40 px-3 py-2 text-sm text-emerald-400">
          Student added successfully.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-32">
          <label className="mb-1 block text-xs text-slate-400">First Name</label>
          <input
            name="firstName"
            required
            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 text-sm outline-none ring-cyan-400/40 focus:ring"
          />
        </div>
        <div className="flex-1 min-w-32">
          <label className="mb-1 block text-xs text-slate-400">Last Name</label>
          <input
            name="lastName"
            required
            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 text-sm outline-none ring-cyan-400/40 focus:ring"
          />
        </div>
        <div className="w-28">
          <label className="mb-1 block text-xs text-slate-400">Grade (optional)</label>
          <select
            name="grade"
            defaultValue=""
            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 text-sm outline-none ring-cyan-400/40 focus:ring"
          >
            <option value="">None</option>
            <option value="8">8</option>
            <option value="9">9</option>
            <option value="10">10</option>
            <option value="11">11</option>
            <option value="12">12</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add Student"}
          </button>
        </div>
      </div>
    </form>
  );
}
