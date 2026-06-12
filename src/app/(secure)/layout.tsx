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
    { href: "/students",               label: "My Students",         visible: isParent },
    { href: "/request-funds",          label: "Request Funds",       visible: isParent },
    { href: "/terms",                  label: "Terms & Conditions",  visible: isParent },
    { href: "/admin/fundraisers",      label: "Fundraisers",         visible: can(role, "manageFundraising") },
    { href: "/admin/students",         label: "All Students",        visible: can(role, "allStudents") },
    { href: "/admin/fundraising",      label: "All Fundraising",     visible: can(role, "allFunds") },
    { href: "/admin/expenses",         label: "All Expenses",        visible: can(role, "allFunds") },
    { href: "/admin/parents",          label: "Registered Parents",  visible: can(role, "approvals") || can(role, "manageFundraising") },
    { href: "/admin/fund-requests",    label: "Fund Requests",       visible: can(role, "fundRequests") },
    { href: "/admin/approvals",        label: "Account Approvals",   visible: can(role, "approvals") },
    { href: "/admin/receipts",         label: "Email Receipts",      visible: can(role, "fundRequests") || can(role, "allFunds") },
    { href: "/settings",               label: "Settings",            visible: can(role, "settings") },
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
