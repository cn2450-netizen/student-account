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
}: {
  children: React.ReactNode;
  username: string;
  role: string;
  nav: NavEntry[];
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <IdleLogout />
      <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-cyan-300">
              WWT Student Account Tracker
            </h1>
            <p className="text-xs text-slate-400">Fundraising &amp; expense management</p>
          </div>
          <div className="text-right text-sm">
            <p>{username}</p>
            <p className="text-xs uppercase tracking-wide text-slate-400">{role}</p>
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
