import Link from "next/link";
import { IdleLogout, SignOutButton } from "@/components/idle-logout";

type NavEntry = {
  href: string;
  label: string;
  visible: boolean;
};

export function AppShell({
  children,
  username,
  role,
  nav,
  showSettings,
}: {
  children: React.ReactNode;
  username: string;
  role: string;
  nav: NavEntry[];
  showSettings?: boolean;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <IdleLogout />
      <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-cyan-300">
              Student Account Tracker
            </h1>
            <p className="text-xs text-slate-400">Fundraising &amp; expense management</p>
          </div>
          <div className="relative group text-right text-sm">
            <button
              type="button"
              className="rounded-lg px-2 py-1 hover:bg-slate-800/70 focus:bg-slate-800/70 focus:outline-none"
            >
              <p>{username}</p>
              <p className="text-xs uppercase tracking-wide text-slate-400">{role}</p>
            </button>
            <div className="absolute right-0 mt-1 hidden min-w-36 rounded-lg border border-slate-700 bg-slate-900 p-1 text-left shadow-lg group-hover:block group-focus-within:block">
              {showSettings && (
                <Link
                  href="/settings"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-cyan-300"
                >
                  Settings
                </Link>
              )}
              <SignOutButton />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-screen-2xl grid-cols-1 gap-4 p-4 md:grid-cols-[220px_1fr]">
        <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 md:self-start">
          <nav className="space-y-1">
            {nav
              .filter((n) => n.visible)
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-cyan-300"
                >
                  {item.label}
                </Link>
              ))}
          </nav>
          <div className="mt-3 border-t border-slate-800 pt-3">
            <SignOutButton />
          </div>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
