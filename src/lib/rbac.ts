export type Permission =
  | "admin"               // full admin access
  | "settings"            // access settings pages (admin + president)
  | "approvals"           // manage account approval queue
  | "allStudents"         // view/manage all students
  | "allFunds"            // view/manage all fundraising & expenses
  | "fundRequests"        // approve/deny fund requests (treasurer + admin)
  | "manageFundraising"   // add fundraising entries for all students
  | "ownStudents"         // manage own students (parent)
  | "ownFunds"            // view own fundraising & expenses (parent)
  | "submitRequests"      // submit fund requests (parent)
  | "unlockAccounts";     // unlock permanently locked accounts (president + admin)

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  ADMIN:                ["admin", "settings", "approvals", "allStudents", "allFunds", "fundRequests", "manageFundraising", "ownStudents", "ownFunds", "unlockAccounts"],
  PRESIDENT:            ["settings", "approvals", "allStudents", "allFunds", "fundRequests", "unlockAccounts"],
  TREASURER:            ["approvals", "allStudents", "allFunds", "fundRequests", "manageFundraising"],
  FUNDRAISING_MANAGER:  ["allStudents", "manageFundraising"],
  BOARD_MEMBER:         ["allStudents"],
  PARENT:               ["ownStudents", "ownFunds", "submitRequests"],
};

export function can(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
