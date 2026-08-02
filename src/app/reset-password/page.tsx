import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(6,182,212,0.15),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(16,185,129,0.12),transparent_35%)]" />
      <section className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
        <h1 className="mb-1 text-3xl font-semibold tracking-tight text-slate-100">
          Set a new password
        </h1>
        <p className="mb-6 text-sm text-slate-400">
          Choose a new password for your account.
        </p>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 shadow-xl">
            <p className="text-sm text-rose-400">
              This reset link is missing its token. Request a new one from the{" "}
              <Link href="/forgot-password" className="underline underline-offset-2">
                forgot password
              </Link>{" "}
              page.
            </p>
          </div>
        )}
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
