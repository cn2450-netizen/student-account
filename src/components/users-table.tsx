"use client";

import { useState, useTransition } from "react";
import { resetUserPassword, deleteUser } from "@/app/actions";

type User = {
  id: string;
  username: string;
  role: string;
  forcePasswordChange: boolean;
  createdAt: Date;
};

export function UsersTable({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  const [isPending, startTransition] = useTransition();
  const [tempPasswords, setTempPasswords] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const handleReset = (userId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await resetUserPassword(userId);
      if (result.error) {
        setError(result.error);
      } else if (result.tempPassword) {
        setTempPasswords((prev) => ({ ...prev, [userId]: result.tempPassword! }));
      }
    });
  };

  const handleDelete = (userId: string, username: string) => {
    if (!confirm(`Delete user "${username}"? This will remove all their students and financial data.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteUser(userId);
      if (result.error) setError(result.error);
    });
  };

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-400">{error}</p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/80">
              <th className="px-4 py-3 text-left font-medium text-slate-400">Username</th>
              <th className="px-4 py-3 text-left font-medium text-slate-400">Role</th>
              <th className="px-4 py-3 text-left font-medium text-slate-400">Status</th>
              <th className="px-4 py-3 text-left font-medium text-slate-400">Joined</th>
              <th className="px-4 py-3 text-right font-medium text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users.map((user) => (
              <tr key={user.id} className="bg-slate-900/40 hover:bg-slate-800/50">
                <td className="px-4 py-3 text-slate-200">{user.username}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      user.role === "ADMIN"
                        ? "bg-cyan-900/40 text-cyan-300"
                        : "bg-slate-700/60 text-slate-300"
                    }`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {user.forcePasswordChange ? (
                    <span className="text-xs text-amber-400">Password reset required</span>
                  ) : (
                    <span className="text-xs text-emerald-400">Active</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {tempPasswords[user.id] && (
                      <span className="rounded bg-amber-900/30 px-2 py-0.5 font-mono text-xs text-amber-300">
                        {tempPasswords[user.id]}
                      </span>
                    )}
                    {user.id !== currentUserId && (
                      <>
                        <button
                          onClick={() => handleReset(user.id)}
                          disabled={isPending}
                          className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-100 disabled:opacity-50"
                        >
                          Reset Password
                        </button>
                        <button
                          onClick={() => handleDelete(user.id, user.username)}
                          disabled={isPending}
                          className="rounded-md px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 hover:text-red-300 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </>
                    )}
                    {user.id === currentUserId && (
                      <span className="text-xs text-slate-600">(you)</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
