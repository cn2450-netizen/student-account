"use client";

import { useActionState } from "react";
import { registerParentAccount } from "@/app/actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerParentAccount, { error: undefined, success: undefined });

  if (state.success) {
    return (
      <div className="rounded-2xl border border-emerald-600/40 bg-emerald-900/20 p-6 text-center space-y-2">
        <p className="text-lg font-semibold text-emerald-300">Request Submitted!</p>
        <p className="text-sm text-slate-300">
          Your account request is pending administrator approval. You will be able to log in once
          approved.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-6 shadow-xl">
      {state.error ? (
        <p className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-400">{state.error}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm text-slate-300">First Name</label>
          <input
            name="firstName"
            required
            autoFocus
            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-cyan-400/40 focus:ring"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">Last Name</label>
          <input
            name="lastName"
            required
            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-cyan-400/40 focus:ring"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-300">Phone Number</label>
        <input
          name="phone"
          type="tel"
          required
          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-cyan-400/40 focus:ring"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-300">Email Address</label>
        <input
          name="email"
          type="email"
          required
          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-cyan-400/40 focus:ring"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-300">Password</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-cyan-400/40 focus:ring"
        />
        <p className="mt-1 text-xs text-slate-500">Minimum 8 characters</p>
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-300">Confirm Password</label>
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 outline-none ring-cyan-400/40 focus:ring"
        />
      </div>

      <div className="flex items-start gap-3">
        <input
          id="terms"
          name="terms"
          type="checkbox"
          required
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-950 accent-cyan-500"
        />
        <label htmlFor="terms" className="text-xs text-slate-400 leading-relaxed">
          I have read and agree to the{" "}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 underline"
          >
            Terms &amp; Conditions
          </a>
          . I understand that all funds must originate from the account holder or a named student,
          that third-party contributions cannot be accepted, and that this account has no cash value.
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit Account Request"}
      </button>
    </form>
  );
}
