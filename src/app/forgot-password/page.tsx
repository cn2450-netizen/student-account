import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(6,182,212,0.15),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(16,185,129,0.12),transparent_35%)]" />
      <section className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
        <h1 className="mb-1 text-3xl font-semibold tracking-tight text-slate-100">
          Reset your password
        </h1>
        <p className="mb-6 text-sm text-slate-400">
          Enter your account email and we&apos;ll send you a link to set a new password.
        </p>
        <ForgotPasswordForm />
        <p className="mt-4 text-center text-sm text-slate-500">
          <Link
            href="/login"
            className="font-medium text-cyan-400 transition hover:text-cyan-300 underline underline-offset-2"
          >
            Back to sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
