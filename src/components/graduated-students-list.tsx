"use client";

import { useState, useTransition } from "react";
import { approveGraduationTransfer, transferGraduatedBalance } from "@/app/actions";

type Sibling = { id: string; firstName: string; lastName: string };

type GraduatedStudent = {
  id: string;
  firstName: string;
  lastName: string;
  graduatedAt: Date | null;
  transferApproved: boolean;
  transferApprovedAt: Date | null;
  transferApprovedBy: string | null;
  transferNotes: string | null;
  parent: { firstName: string; lastName: string; phone: string } | null;
  siblings: Sibling[];
  raised: number;
  spent: number;
};

export function GraduatedStudentsList({
  students,
  readOnly = false,
}: {
  students: GraduatedStudent[];
  readOnly?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/70 overflow-hidden divide-y divide-slate-800">
      {students.map((s) => (
        <GraduatedStudentRow key={s.id} student={s} readOnly={readOnly} />
      ))}
    </div>
  );
}

function GraduatedStudentRow({
  student: s,
  readOnly,
}: {
  student: GraduatedStudent;
  readOnly: boolean;
}) {
  const balance = s.raised - s.spent;
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const [siblingId, setSiblingId] = useState(s.siblings[0]?.id ?? "");
  const [transferError, setTransferError] = useState("");
  const [transferResult, setTransferResult] = useState<{ amount: number; to: string } | null>(null);
  const [isTransferring, startTransfer] = useTransition();

  const handleApprove = () => {
    setError("");
    startTransition(async () => {
      const result = await approveGraduationTransfer(s.id, notes);
      if (result.error) setError(result.error);
    });
  };

  const handleTransfer = () => {
    setTransferError("");
    const sibling = s.siblings.find((sib) => sib.id === siblingId);
    if (!sibling) {
      setTransferError("Select a sibling to transfer to");
      return;
    }
    startTransfer(async () => {
      const result = await transferGraduatedBalance(s.id, siblingId);
      if (result.error) {
        setTransferError(result.error);
      } else {
        setTransferResult({ amount: result.amount ?? 0, to: `${sibling.firstName} ${sibling.lastName}` });
      }
    });
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Student info */}
        <div>
          <p className="font-semibold text-slate-100">
            {s.firstName} {s.lastName}
          </p>
          <p className="text-xs text-slate-400">
            Parent:{" "}
            {s.parent
              ? `${s.parent.firstName} ${s.parent.lastName} · ${s.parent.phone}`
              : <span className="italic">No profile</span>}
          </p>
          {s.graduatedAt && (
            <p className="text-xs text-slate-500">
              Graduated: {new Date(s.graduatedAt).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Balance summary */}
        <div className="text-right space-y-0.5">
          <p className="text-xs text-emerald-400">Raised: ${s.raised.toFixed(2)}</p>
          <p className="text-xs text-rose-400">Spent: ${s.spent.toFixed(2)}</p>
          <p className={`text-sm font-bold ${balance >= 0 ? "text-cyan-300" : "text-amber-400"}`}>
            Balance: ${balance.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Approved state */}
      {readOnly && s.transferApproved && (
        <div className="rounded-lg bg-emerald-900/30 border border-emerald-700/40 px-3 py-2 text-xs text-emerald-300 space-y-0.5">
          <p>
            Transfer approved by <span className="font-semibold">{s.transferApprovedBy}</span>
            {s.transferApprovedAt && ` on ${new Date(s.transferApprovedAt).toLocaleDateString()}`}
          </p>
          {s.transferNotes && <p className="text-slate-400">Notes: {s.transferNotes}</p>}
        </div>
      )}

      {/* Pending actions */}
      {!readOnly && !s.transferApproved && (
        <div className="space-y-3 pt-1">
          {/* Transfer to sibling */}
          {transferResult ? (
            <div className="rounded-lg bg-emerald-900/30 border border-emerald-700/40 px-3 py-2 text-xs text-emerald-300">
              Transferred ${transferResult.amount.toFixed(2)} to {transferResult.to}.
            </div>
          ) : s.siblings.length > 0 ? (
            <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3 space-y-2">
              <p className="text-xs font-medium text-slate-300">Transfer balance to a sibling</p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={siblingId}
                  onChange={(e) => setSiblingId(e.target.value)}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {s.siblings.map((sib) => (
                    <option key={sib.id} value={sib.id}>
                      {sib.firstName} {sib.lastName}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleTransfer}
                  disabled={isTransferring || balance <= 0}
                  className="rounded-lg bg-cyan-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors"
                >
                  {isTransferring ? "Transferring…" : `Transfer $${balance.toFixed(2)}`}
                </button>
              </div>
              {transferError && <p className="text-xs text-rose-400">{transferError}</p>}
            </div>
          ) : null}

          {/* Approve without transfer */}
          {!transferResult && (
            <div className="flex flex-wrap items-end gap-2">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Transfer notes (optional)"
                className="flex-1 min-w-48 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <button
                onClick={handleApprove}
                disabled={isPending}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Approving…" : "Approve Without Transfer"}
              </button>
              {error && <p className="w-full text-xs text-rose-400">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
