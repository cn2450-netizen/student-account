import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentSession } from "@/lib/auth";
import { can } from "@/lib/rbac";

export default async function SecureLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login");

  const isAdmin = can(session.user.role, "admin");
  const isParent = session.user.role === "PARENT";
  const isPresident = session.user.role === "PRESIDENT";
  const isTreasurer = can(session.user.role, "fundRequests") && !isAdmin && !isPresident;
  const isFundraisingManager = can(session.user.role, "manageFundraising") && !isAdmin;
  const isBoardMember = session.user.role === "BOARD_MEMBER";
  const canUnlock = can(session.user.role, "unlockAccounts");

  const nav = [
    { href: "/dashboard",                 label: "Dashboard",          visible: true },
    { href: "/students",                  label: "My Students",         visible: isParent },
    { href: "/request-funds",             label: "Request Funds",       visible: isParent },
    { href: "/terms",                     label: "Terms & Conditions",  visible: isParent },
    { href: "/admin/fundraisers",         label: "Fundraisers",         visible: can(session.user.role, "manageFundraising") },
    { href: "/admin/students",            label: "All Students",        visible: isTreasurer || isPresident || isFundraisingManager || isBoardMember || isAdmin },
    { href: "/admin/fundraising",         label: "All Fundraising",     visible: isTreasurer || isPresident || isFundraisingManager },
    { href: "/admin/expenses",            label: "All Expenses",        visible: false },
    { href: "/admin/parents",             label: "Registered Parents",  visible: isAdmin || isTreasurer || isPresident || isFundraisingManager },
    { href: "/admin/fund-requests",       label: "Fund Requests",       visible: isTreasurer || isPresident },
    { href: "/admin/approvals",           label: "Account Approvals",   visible: isAdmin || isTreasurer || isPresident },
    { href: "/admin/locked-accounts",    label: "Locked Accounts",     visible: canUnlock },
  ];

  return (
    <AppShell
      username={session.user.name}
      role={session.user.role}
      nav={nav}
      showSettings={isAdmin}
    >
      {children}
    </AppShell>
  );
}
