import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForcePasswordForm } from "@/components/force-password-form";

export default async function ChangePasswordPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login");
  if (!session.user.forcePasswordChange) redirect("/dashboard");

  // Distinguish between first-time setup and annual expiry
  const userRecord = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordChangedAt: true, role: true },
  });
  const isExpiry = userRecord?.role === "PARENT" && userRecord.passwordChangedAt !== null;

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(6,182,212,0.15),transparent_40%)]" />
      <section className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">
          {isExpiry ? "Password Expired" : "Set Your Password"}
        </h1>
        <p className="mb-6 text-sm text-slate-400">
          {isExpiry
            ? "Your password must be updated annually. Please set a new password to continue."
            : "You must set a new password before accessing the application."}
        </p>
        <ForcePasswordForm username={session.user.name} />
      </section>
    </main>
  );
}
