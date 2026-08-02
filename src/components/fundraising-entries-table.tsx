"use client";

import { useState, useTransition } from "react";
import { editFundraisingEntry } from "@/app/actions";

type Entry = {
  id: string;
  amount: number;
  description: string;
  date: Date;
  student: {
    firstName: string;
    lastName: string;
    profile: { firstName: string; lastName: string };
  };
};

export function FundraisingEntriesTable({ entries, canEdit }: { entries: Entry[]; canEdit: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const startEdit = (entry: Entry) => {
    setError(null);
    setSavedId(null);
    setEditingId(entry.id);
    setAmount(String(entry.amount));
    setDescription(entry.description);
    setReason("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError(null);
  };

  const handleSave = (entryId: string) => {
    setError(null);
    const fd = new FormData();
    fd.set("amount", amount);
    fd.set("description", description);
    fd.set("reason", reason);
    startTransition(async () => {
      const result = await editFundraisingEntry(entryId, fd);
      if (result.error) {
        setError(result.error);
      } else {
        setEditingId(null);
        setSavedId(entryId);
      }
    });
  };

  if (entries.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-slate-500">No fundraising entries.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400">
          <th className="px-4 py-3">Date</th>
          <th className="px-4 py-3">Student</th>
          <th className="px-4 py-3">Parent</th>
          <th className="px-4 py-3">Description</th>
          <th className="px-4 py-3 text-right">Amount</th>
          {canEdit && <th className="px-4 py-3"></th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {entries.map((e) =>
          editingId === e.id ? (
            <tr key={e.id} className="bg-slate-800/40">
              <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                {new Date(e.date).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-slate-100">
                {e.student.firstName} {e.student.lastName}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {e.student.profile.firstName} {e.student.profile.lastName}
              </td>
              <td colSpan={3} className="px-4 py-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Description</label>
                    <input
                      value={description}
                      onChange={(ev) => setDescription(ev.target.value)}
                      className="w-40 rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500/70"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={amount}
                      onChange={(ev) => setAmount(ev.target.value)}
                      className="w-28 rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500/70"
                    />
                  </div>
                  <div className="flex-1 min-w-48">
                    <label className="mb-1 block text-xs text-slate-400">
                      Reason for correction <span className="text-red-400">*</span>
                    </label>
                    <input
                      value={reason}
                      onChange={(ev) => setReason(ev.target.value)}
                      placeholder="e.g. typo — entered $100 instead of $10"
                      className="w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500/70"
                    />
                  </div>
                  <button
                    onClick={() => handleSave(e.id)}
                    disabled={isPending || !amount || !description.trim() || !reason.trim()}
                    className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={isPending}
                    className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
                {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
              </td>
            </tr>
          ) : (
            <tr key={e.id} className="hover:bg-slate-800/40 transition">
              <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                {new Date(e.date).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-slate-100">
                {e.student.firstName} {e.student.lastName}
              </td>
              <td className="px-4 py-3 text-slate-300">
                {e.student.profile.firstName} {e.student.profile.lastName}
              </td>
              <td className="px-4 py-3 text-slate-300">{e.description}</td>
              <td className="px-4 py-3 text-right font-medium text-emerald-400">
                ${e.amount.toFixed(2)}
              </td>
              {canEdit && (
                <td className="px-4 py-3 text-right">
                  {savedId === e.id ? (
                    <span className="text-xs text-emerald-400">Corrected</span>
                  ) : (
                    <button
                      onClick={() => startEdit(e)}
                      className="text-xs text-cyan-400 hover:text-cyan-300"
                    >
                      Edit
                    </button>
                  )}
                </td>
              )}
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}
