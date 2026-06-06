import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/auth";
import { can, type Permission } from "@/lib/rbac";

export async function requirePermission(permission: Permission) {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, permission)) redirect("/dashboard");
  return session.user;
}

export async function requireAuth() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login");
  return session.user;
}
