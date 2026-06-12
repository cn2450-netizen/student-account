import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/secure-page";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getEmailConfig,
  sendTestEmail,
  DEFAULT_DEPOSIT_SUBJECT,
  DEFAULT_DEPOSIT_BODY,
  DEFAULT_APPROVAL_SUBJECT,
  DEFAULT_APPROVAL_BODY,
} from "@/lib/email";

export default async function SettingsEmailPage({
  searchParams,
}: {
  searchParams?: Record<string, string>;
}) {
  await requirePermission("settings");

  const cfg = await getEmailConfig();
  const s = searchParams ?? {};

  const smtpSaved     = s.section === "smtp"     && s.updated === "1";
  const testSent      = s.section === "test"     && s.updated === "1";
  const testFailed    = s.section === "test"     && s.updated === "0";
  const depositSaved  = s.section === "deposit"  && s.updated === "1";
  const approvalSaved = s.section === "approval" && s.updated === "1";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Email Notifications</h2>
        <p className="mt-1 text-sm text-slate-400">
          Configure SMTP settings and email templates for deposit receipts and account approvals.
        </p>
      </div>

      {/* ── SMTP ───────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-cyan-300">SMTP Configuration</h3>
            <p className="text-sm text-slate-400">Connection settings for the outgoing mail server.</p>
          </div>
          {smtpSaved && (
            <span className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
              Saved.
            </span>
          )}
        </div>

        {/* Current config summary */}
        <div className="rounded-xl bg-slate-950/60 p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Current Configuration</p>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Host</dt>
              <dd className="mt-0.5 text-slate-200 font-mono">{cfg.host || <span className="text-slate-600">(not set)</span>}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Port / TLS</dt>
              <dd className="mt-0.5 text-slate-200">{cfg.port} {cfg.secure ? "· TLS enabled" : "· TLS disabled"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Username</dt>
              <dd className="mt-0.5 text-slate-200">{cfg.user || <span className="text-slate-600">(none)</span>}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Password</dt>
              <dd className="mt-0.5 text-slate-200">{cfg.pass ? "••••••••" : <span className="text-slate-600">(not set)</span>}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">From</dt>
              <dd className="mt-0.5 text-slate-200">{cfg.from || <span className="text-slate-600">(not set)</span>}</dd>
            </div>
          </dl>
          {!cfg.host && (
            <p className="mt-3 text-xs text-amber-400">Email sending is disabled — configure the SMTP host and From address below to enable notifications.</p>
          )}
        </div>

        <form action={saveSmtp} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="host" className="block text-sm font-medium text-slate-300">SMTP Host</label>
              <input
                id="host" name="host" defaultValue={cfg.host} placeholder="smtp.example.com"
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200 outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30"
              />
            </div>

            <div>
              <label htmlFor="port" className="block text-sm font-medium text-slate-300">Port</label>
              <input
                id="port" name="port" type="number" defaultValue={cfg.port} min={1} max={65535}
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200 outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30"
              />
            </div>

            <div className="flex items-end pb-0.5">
              <label className="inline-flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200">
                <input
                  name="secure" type="checkbox" defaultChecked={cfg.secure}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500"
                />
                Use TLS/SSL (port 465)
              </label>
            </div>

            <div>
              <label htmlFor="user" className="block text-sm font-medium text-slate-300">Username</label>
              <input
                id="user" name="user" defaultValue={cfg.user} placeholder="smtp-user@example.com"
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200 outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30"
              />
            </div>

            <div>
              <label htmlFor="pass" className="block text-sm font-medium text-slate-300">Password</label>
              <input
                id="pass" name="pass" type="password" defaultValue={cfg.pass} autoComplete="new-password"
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200 outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="from" className="block text-sm font-medium text-slate-300">From Address</label>
              <input
                id="from" name="from" defaultValue={cfg.from}
                placeholder='School Boosters <noreply@school.org>'
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200 outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30"
              />
              <p className="mt-1 text-xs text-slate-500">
                Format: <code className="rounded bg-slate-800 px-1 font-mono text-slate-300">Display Name &lt;address@domain.com&gt;</code>
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            Save SMTP Settings
          </button>
        </form>
      </div>

      {/* ── Test ───────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-3">
        <h3 className="font-semibold text-cyan-300">Send Test Email</h3>
        <p className="text-sm text-slate-400">
          Send a test message to your account email to verify the SMTP configuration is working.
        </p>
        {testSent && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            Test email sent — check your inbox.
          </div>
        )}
        {testFailed && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            Failed to send test email. Check your SMTP settings above.
          </div>
        )}
        <form action={runTestEmail}>
          <button
            type="submit"
            className="rounded-2xl bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-600"
          >
            Send Test Email
          </button>
        </form>
      </div>

      {/* ── Deposit Receipt Template ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-cyan-300">Deposit Receipt Template</h3>
            <p className="text-sm text-slate-400">
              Sent to the parent when a fundraising deposit is added to their student&apos;s account.
            </p>
          </div>
          {depositSaved && (
            <span className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
              Saved.
            </span>
          )}
        </div>

        <div className="rounded-xl bg-slate-950/60 px-4 py-3 text-xs text-slate-400">
          Available variables:{" "}
          {["{{parentName}}", "{{studentName}}", "{{amount}}", "{{description}}", "{{date}}"].map((v) => (
            <code key={v} className="mr-2 rounded bg-slate-800 px-1 font-mono text-slate-300">{v}</code>
          ))}
        </div>

        <form action={saveDepositTemplate} className="space-y-4">
          <div>
            <label htmlFor="depositSubject" className="block text-sm font-medium text-slate-300">Subject</label>
            <input
              id="depositSubject" name="depositSubject" defaultValue={cfg.depositSubject}
              placeholder={DEFAULT_DEPOSIT_SUBJECT}
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200 outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30"
            />
          </div>
          <div>
            <label htmlFor="depositBody" className="block text-sm font-medium text-slate-300">Body (HTML)</label>
            <textarea
              id="depositBody" name="depositBody" rows={10} defaultValue={cfg.depositBody}
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 font-mono text-sm text-slate-200 outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Save Template
            </button>
            <button
              type="submit" name="reset" value="1"
              className="rounded-2xl border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-400 transition hover:border-slate-500 hover:text-slate-300"
            >
              Reset to Default
            </button>
          </div>
        </form>
      </div>

      {/* ── Account Approval Template ───────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-cyan-300">Account Approval Template</h3>
            <p className="text-sm text-slate-400">
              Sent to the parent when their account registration is approved.
            </p>
          </div>
          {approvalSaved && (
            <span className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
              Saved.
            </span>
          )}
        </div>

        <div className="rounded-xl bg-slate-950/60 px-4 py-3 text-xs text-slate-400">
          Available variables:{" "}
          {["{{parentName}}", "{{loginUrl}}"].map((v) => (
            <code key={v} className="mr-2 rounded bg-slate-800 px-1 font-mono text-slate-300">{v}</code>
          ))}
        </div>

        <form action={saveApprovalTemplate} className="space-y-4">
          <div>
            <label htmlFor="approvalSubject" className="block text-sm font-medium text-slate-300">Subject</label>
            <input
              id="approvalSubject" name="approvalSubject" defaultValue={cfg.approvalSubject}
              placeholder={DEFAULT_APPROVAL_SUBJECT}
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200 outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30"
            />
          </div>
          <div>
            <label htmlFor="approvalBody" className="block text-sm font-medium text-slate-300">Body (HTML)</label>
            <textarea
              id="approvalBody" name="approvalBody" rows={8} defaultValue={cfg.approvalBody}
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 font-mono text-sm text-slate-200 outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Save Template
            </button>
            <button
              type="submit" name="reset" value="1"
              className="rounded-2xl border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-400 transition hover:border-slate-500 hover:text-slate-300"
            >
              Reset to Default
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Server actions ────────────────────────────────────────────────────────────

async function saveSmtp(formData: FormData) {
  "use server";
  const fields: Record<string, string> = {
    "email.host":   (formData.get("host")   as string | null)?.trim() ?? "",
    "email.port":   (formData.get("port")   as string | null)?.trim() ?? "587",
    "email.secure": formData.get("secure") === "on" ? "true" : "false",
    "email.user":   (formData.get("user")   as string | null)?.trim() ?? "",
    "email.pass":   (formData.get("pass")   as string | null) ?? "",
    "email.from":   (formData.get("from")   as string | null)?.trim() ?? "",
  };
  await Promise.all(
    Object.entries(fields).map(([key, value]) =>
      prisma.appConfig.upsert({ where: { key }, update: { value }, create: { key, value } }),
    ),
  );
  redirect("/settings/email?section=smtp&updated=1");
}

async function runTestEmail() {
  "use server";
  const session = await getCurrentSession();
  if (!session?.user?.name) redirect("/settings/email?section=test&updated=0");
  try {
    await sendTestEmail(session.user.name);
    redirect("/settings/email?section=test&updated=1");
  } catch {
    redirect("/settings/email?section=test&updated=0");
  }
}

async function saveDepositTemplate(formData: FormData) {
  "use server";
  const reset   = formData.get("reset") === "1";
  const subject = reset ? DEFAULT_DEPOSIT_SUBJECT : ((formData.get("depositSubject") as string | null)?.trim() ?? DEFAULT_DEPOSIT_SUBJECT);
  const body    = reset ? DEFAULT_DEPOSIT_BODY    : ((formData.get("depositBody")    as string | null) ?? DEFAULT_DEPOSIT_BODY);
  await Promise.all([
    prisma.appConfig.upsert({ where: { key: "email.depositSubject" }, update: { value: subject }, create: { key: "email.depositSubject", value: subject } }),
    prisma.appConfig.upsert({ where: { key: "email.depositBody"    }, update: { value: body    }, create: { key: "email.depositBody",    value: body    } }),
  ]);
  redirect("/settings/email?section=deposit&updated=1");
}

async function saveApprovalTemplate(formData: FormData) {
  "use server";
  const reset   = formData.get("reset") === "1";
  const subject = reset ? DEFAULT_APPROVAL_SUBJECT : ((formData.get("approvalSubject") as string | null)?.trim() ?? DEFAULT_APPROVAL_SUBJECT);
  const body    = reset ? DEFAULT_APPROVAL_BODY    : ((formData.get("approvalBody")    as string | null) ?? DEFAULT_APPROVAL_BODY);
  await Promise.all([
    prisma.appConfig.upsert({ where: { key: "email.approvalSubject" }, update: { value: subject }, create: { key: "email.approvalSubject", value: subject } }),
    prisma.appConfig.upsert({ where: { key: "email.approvalBody"    }, update: { value: body    }, create: { key: "email.approvalBody",    value: body    } }),
  ]);
  redirect("/settings/email?section=approval&updated=1");
}
