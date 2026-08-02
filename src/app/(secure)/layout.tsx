import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentSession } from "@/lib/auth";
import { can } from "@/lib/rbac";

export default async function SecureLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  const isParent = role === "PARENT";

  const nav = [
    { href: "/dashboard",              label: "Dashboard",           visible: true },
    { href: "/admin/approvals",        label: "Account Approvals",   visible: can(role, "approvals") },
    { href: "/admin/expenses",         label: "All Expenses",        visible: can(role, "allFunds") },
    { href: "/admin/students",         label: "All Students",        visible: can(role, "allStudents") },
    { href: "/admin/receipts",         label: "Email Receipts",      visible: can(role, "fundRequests") || can(role, "allFunds") },
    { href: "/admin/fundraisers",      label: "Fundraisers",         visible: can(role, "manageFundraising") },
    { href: "/admin/fundraising",      label: "Funds Applied",       visible: can(role, "allFunds") },
    { href: "/admin/fund-requests",    label: "Funds Requested",     visible: can(role, "fundRequests") },
    { href: "/students",               label: "My Students",         visible: isParent },
    { href: "/admin/parents",          label: "Registered Parents",  visible: can(role, "approvals") || can(role, "manageFundraising") },
    { href: "/request-funds",          label: "Request Funds",       visible: isParent },
    { href: "/settings",               label: "Settings",            visible: can(role, "settings") },
    { href: "/terms",                  label: "Terms & Conditions",  visible: isParent },
  ];

  return (
    <AppShell
      username={session.user.name}
      role={session.user.role}
      nav={nav}
    >
      {children}
    </AppShell>
  );
}
