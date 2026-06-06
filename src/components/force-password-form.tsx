"use client";

import { useActionState, useEffect, useRef } from "react";
import { signIn } from "next-auth/react";
import { changePasswordOnFirstLogin } from "@/app/actions";

export function ForcePasswordForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState(changePasswordOnFirstLogin, { error: undefined, success: undefined });
  const newPasswordRef = useRef("");

  useEffect(() => {
    if (state.success) {
      signIn("credentials", {
        username,
        password: newPasswordRef.current,
        callbackUrl: "/dashboard",
      });
    }
  }, [state.success, username]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const fd = new FormData(e.currentTarget);
        newPasswordRef.current = String(fd.get("newPassword") ?? "");
      }}
      className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-6 shadow-xl"
    >
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
        {pending ? "Saving…" : "Set Password"}
      </button>
    </form>
  );
}
