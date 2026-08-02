"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordWithToken } from "@/app/actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordWithToken, { error: undefined, success: undefined });

  if (state.success) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 shadow-xl">
        <p className="text-sm text-slate-200">
          Your password has been reset.{" "}
          <Link href="/login" className="font-medium text-cyan-400 underline underline-offset-2 hover:text-cyan-300">
            Sign in
          </Link>{" "}
          with your new password.
        </p>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-6 shadow-xl"
    >
      <input type="hidden" name="token" value={token} />

      {state.error ? (
        <p className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-400">{state.error}</p>
      ) : null}

      <div>
        <label className="mb-1 block text-sm text-slate-300">New Password</label>
        <input
          type="password"
          name="newPassword"
          required
          autoFocus
          minLength={8}
          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-cyan-400/40 focus:ring"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-300">Confirm Password</label>
        <input
          type="password"
          name="confirmPassword"
          required
          minLength={8}
          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-cyan-400/40 focus:ring"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Reset Password"}
      </button>
    </form>
  );
}
