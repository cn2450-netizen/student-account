"use client";

import { useActionState, useEffect, useRef } from "react";
import { createStaffUser } from "@/app/actions";

const initial = { error: undefined, success: undefined };

export function CreateStaffUserForm() {
  const [state, dispatch, isPending] = useActionState(createStaffUser, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-200">Create Staff Account</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Create a new Admin or Treasurer account. Parent accounts are created through the registration form.
        </p>
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-400">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-900/40 px-3 py-2 text-sm text-emerald-400">
          User created successfully.
        </p>
      )}

      <form ref={formRef} action={dispatch} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="sm:col-span-1">
          <label className="block text-xs text-slate-400 mb-1">Username</label>
          <input
            name="username"
            required
            minLength={3}
            autoComplete="off"
            placeholder="e.g. treasurer1"
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div className="sm:col-span-1">
          <label className="block text-xs text-slate-400 mb-1">Password</label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Min. 8 characters"
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div className="sm:col-span-1">
          <label className="block text-xs text-slate-400 mb-1">Role</label>
          <select
            name="role"
            defaultValue="TREASURER"
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="TREASURER">Treasurer (max 1)</option>
            <option value="PRESIDENT">President</option>
            <option value="FUNDRAISING_MANAGER">Fundraising Manager</option>
            <option value="BOARD_MEMBER">Board Member</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>

        <div className="sm:col-span-1 flex items-end">
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 transition"
          >
            {isPending ? "Creating…" : "Create User"}
          </button>
        </div>
      </form>
    </div>
  );
}
