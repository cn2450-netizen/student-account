import Link from "next/link";
import { requirePermission } from "@/lib/secure-page";

export default async function SettingsPage() {
  await requirePermission("admin");

  const cards = [
    {
      href: "/settings/users",
      title: "User Accounts",
      description: "View all users, reset passwords, and manage roles.",
    },
    {
      href: "/settings/rbac",
      title: "Permissions",
      description: "Overview of role-based access control for each user role.",
    },
    {
      href: "/settings/ssl",
      title: "SSL Certificate",
      description: "View SSL certificate details and manage HTTPS settings.",
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-100">Settings</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 transition hover:border-cyan-500/50 hover:bg-slate-800/70"
          >
            <h3 className="font-semibold text-cyan-300">{card.title}</h3>
            <p className="mt-1 text-sm text-slate-400">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
