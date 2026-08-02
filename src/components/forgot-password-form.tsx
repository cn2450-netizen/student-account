"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/app/actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, { success: undefined });

  if (state.success) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 shadow-xl">
        <p className="text-sm text-slate-200">
          If an account exists for that email, we&apos;ve sent a link to reset your password.
          The link expires in 1 hour.
        </p>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-6 shadow-xl"
    >
      <div>
        <label className="mb-1 block text-sm text-slate-300">Email / Username</label>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-cyan-400/40 focus:ring"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
