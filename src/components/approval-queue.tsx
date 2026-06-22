"use client";

import { useState, useTransition } from "react";
import { approveAccountRequest, rejectAccountRequest, assignAccountRequest } from "@/app/actions";

type AccountRequest = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  assignedTo: string | null;
  createdAt: Date;
};

export function ApprovalQueue({
  requests,
  reviewerName,
}: {
  requests: AccountRequest[];
  reviewerName: string;
}) {
  const [list, setList] = useState(requests);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [emailNotice, setEmailNotice] = useState<Record<string, { sent: boolean; email: string }>>({});

  function removeFromList(id: string) {
    setList((prev) => prev.filter((r) => r.id !== id));
  }

  function handleAssign(requestId: string, checked: boolean) {
    startTransition(async () => {
      await assignAccountRequest(requestId, checked);
      setList((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, assignedTo: checked ? reviewerName : null } : r)),
      );
    });
  }

  function handleApprove(requestId: string) {
    startTransition(async () => {
      const result = await approveAccountRequest(requestId);
      if (result.error) {
        setFeedback((prev) => ({ ...prev, [requestId]: result.error! }));
      } else {
        removeFromList(requestId);
        if ("emailSent" in result) {
          setEmailNotice((prev) => ({
            ...prev,
            [requestId]: { sent: result.emailSent!, email: result.parentEmail! },
          }));
        }
      }
    });
  }

  function handleReject(requestId: string) {
    startTransition(async () => {
      const result = await rejectAccountRequest(requestId);
      if (result.error) {
        setFeedback((prev) => ({ ...prev, [requestId]: result.error! }));
      } else {
        removeFromList(requestId);
      }
    });
  }

  if (list.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
        No pending account requests.
      </div>
    );
  }

  return (
    <>
    <div className="rounded-xl border border-slate-700 bg-slate-900/70 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-4 py-3">
              <span title="Check to assign this request to yourself for review">
                Student Account Approval
              </span>
            </th>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3">Submitted</th>
            <th className="px-4 py-3">Assigned To</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {list.map((req) => {
            const isAssignedToMe = req.assignedTo === reviewerName;
            return (
              <tr key={req.id} className="hover:bg-slate-800/30 transition">
                {/* Student Account Approval checkbox — assigns reviewer */}
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    title="Assign to me for review"
                    checked={!!req.assignedTo}
                    onChange={(e) => handleAssign(req.id, e.target.checked)}
                    disabled={isPending}
                    className="h-4 w-4 cursor-pointer accent-cyan-400"
                  />
                </td>
                <td className="px-4 py-3 font-medium text-slate-100">
                  {req.firstName} {req.lastName}
                </td>
                <td className="px-4 py-3 text-slate-300">{req.email}</td>
                <td className="px-4 py-3 text-slate-300">{req.phone}</td>
                <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                  {new Date(req.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {req.assignedTo ?? <span className="italic text-slate-600">unassigned</span>}
                </td>
                <td className="px-4 py-3">
                  {feedback[req.id] ? (
                    <p className="text-xs text-rose-400">{feedback[req.id]}</p>
                  ) : (
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => handleApprove(req.id)}
                        disabled={isPending}
                        className="rounded-md bg-emerald-600/80 px-3 py-1 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(req.id)}
                        disabled={isPending}
                        className="rounded-md bg-rose-600/80 px-3 py-1 text-xs font-medium text-white transition hover:bg-rose-500 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="border-t border-slate-700 px-4 py-3 text-xs text-slate-500">
        When approved, the parent will receive access using their email as username and initial
        password — they will be required to set a new password on first login.
      </div>
    </div>

    {Object.entries(emailNotice).map(([id, { sent, email }]) => (
      sent ? (
        <div key={id} className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Account approved — confirmation email sent to <strong>{email}</strong>.
        </div>
      ) : (
        <div key={id} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Account approved — but the confirmation email to <strong>{email}</strong> could not be sent. Check your SMTP settings.
        </div>
      )
    ))}
    </>
  );
}
