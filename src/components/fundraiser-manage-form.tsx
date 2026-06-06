"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { createFundraiser, deleteFundraiser, toggleFundraiser } from "@/app/actions";

type Fundraiser = { id: string; name: string; description: string | null; active: boolean };

const initial = { error: undefined, success: undefined };

export function FundraiserManageForm({ fundraisers }: { fundraisers: Fundraiser[] }) {
  const [state, dispatch, isPending] = useActionState(createFundraiser, initial);
  const [isActing, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  const handleToggle = (id: string, active: boolean) => {
    startTransition(async () => { await toggleFundraiser(id, active); });
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Delete fundraiser "${name}"?`)) return;
    startTransition(async () => { await deleteFundraiser(id); });
  };

  return (
    <div className="space-y-6">
      {/* Add form */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Add Fundraiser</h3>
          <p className="text-xs text-slate-500 mt-0.5">Define a company or campaign that fundraising entries can be linked to.</p>
        </div>

        {state.error && (
          <p className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-400">{state.error}</p>
        )}
        {state.success && (
          <p className="rounded-lg bg-emerald-900/40 px-3 py-2 text-sm text-emerald-400">Fundraiser added.</p>
        )}

        <form ref={formRef} action={dispatch} className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-40">
            <label className="block text-xs text-slate-400 mb-1">Company / Campaign Name</label>
            <input
              name="name"
              required
              minLength={2}
              autoComplete="off"
              placeholder="e.g. Yankee Candle"
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-xs text-slate-400 mb-1">Details (optional)</label>
            <input
              name="description"
              autoComplete="off"
              placeholder="e.g. Fall 2026 catalog sale"
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 transition"
            >
              {isPending ? "Adding…" : "Add Fundraiser"}
            </button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/70 overflow-hidden">
        {fundraisers.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No fundraisers configured yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {fundraisers.map((f) => (
                <tr key={f.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3 font-medium text-slate-100">{f.name}</td>
                  <td className="px-4 py-3 text-slate-400">{f.description ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${f.active ? "bg-emerald-900/40 text-emerald-300" : "bg-slate-700/60 text-slate-500"}`}>
                      {f.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleToggle(f.id, !f.active)}
                        disabled={isActing}
                        className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-100 disabled:opacity-50 transition"
                      >
                        {f.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => handleDelete(f.id, f.name)}
                        disabled={isActing}
                        className="rounded-md px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 hover:text-red-300 disabled:opacity-50 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

