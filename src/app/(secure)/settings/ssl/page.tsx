import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/secure-page";

const envLocalPath = path.join(process.cwd(), ".env.local");
const envPath = path.join(process.cwd(), ".env");

function getEnvFilePath() {
  if (existsSync(envLocalPath)) return envLocalPath;
  return envPath;
}

function updateEnvValue(key: string, value: string) {
  const filePath = getEnvFilePath();
  let content = "";

  if (existsSync(filePath)) {
    content = readFileSync(filePath, "utf8");
  }

  const lines = content.split(/\r?\n/).filter((_) => _ !== "");
  let found = false;
  const updatedLines = lines.map((line) => {
    if (line.trim().startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    updatedLines.push(`${key}=${value}`);
  }

  writeFileSync(filePath, updatedLines.join("\n") + "\n", "utf8");
}

export default async function SettingsSslPage({
  searchParams,
}: {
  searchParams?: { updated?: string };
}) {
  await requirePermission("settings");

  const appUrl = process.env.NEXTAUTH_URL ?? "";
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const extraCa = process.env.NODE_EXTRA_CA_CERTS ?? "(not set)";

  let currentScheme = "https";
  let currentHostPath = "localhost:3000";

  try {
    if (appUrl) {
      const parsed = new URL(appUrl);
      currentScheme = parsed.protocol.replace(":", "");
      currentHostPath = `${parsed.host}${parsed.pathname}`;
    }
  } catch {
    if (appUrl) {
      currentHostPath = appUrl;
    }
  }

  const success = searchParams?.updated === "1";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">SSL Certificate</h2>
        <p className="mt-1 text-sm text-slate-400">
          SSL and application URL settings for this app.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-4">
        <h3 className="font-semibold text-cyan-300">Environment</h3>

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-slate-950/60 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Application URL</dt>
            <dd className="mt-1 break-all text-sm text-slate-200">
              {appUrl || "(not configured)"}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-950/60 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Environment</dt>
            <dd className="mt-1 text-sm text-slate-200">{nodeEnv}</dd>
          </div>
          <div className="rounded-lg bg-slate-950/60 p-3 sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Custom CA Bundle (NODE_EXTRA_CA_CERTS)
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-slate-300">{extraCa}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-cyan-300">Application URL</h3>
            <p className="text-sm text-slate-400">
              Change the public application URL and choose whether to use HTTP or HTTPS.
            </p>
          </div>
          {success ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              Application URL updated.
            </div>
          ) : null}
        </div>

        <form action={updateAppUrl} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-slate-300">Protocol</label>
              <div className="mt-2 flex flex-wrap gap-3">
                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-200">
                  <input
                    type="radio"
                    name="scheme"
                    value="https"
                    defaultChecked={currentScheme === "https"}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500"
                  />
                  HTTPS
                </label>
                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-200">
                  <input
                    type="radio"
                    name="scheme"
                    value="http"
                    defaultChecked={currentScheme === "http"}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500"
                  />
                  HTTP
                </label>
              </div>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="hostPath" className="block text-sm font-medium text-slate-300">
                Host and path
              </label>
              <input
                id="hostPath"
                name="hostPath"
                defaultValue={currentHostPath}
                placeholder="example.com or example.com/app"
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30"
              />
              <p className="mt-2 text-sm text-slate-500">
                Enter the host and optional path for the public application URL. The selected protocol is applied automatically.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Save URL
            </button>
            <p className="text-sm text-slate-500">
              Changes are saved to <code className="rounded bg-slate-800 px-1 py-0.5 font-mono text-xs text-slate-300">.env.local</code> or <code className="rounded bg-slate-800 px-1 py-0.5 font-mono text-xs text-slate-300">.env</code>.
            </p>
          </div>
        </form>

        <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Current NEXTAUTH_URL</p>
          <p className="mt-2 break-all text-sm text-slate-200">{appUrl || "(not configured)"}</p>
        </div>

        <p className="text-sm text-slate-400">
          Use plain HTTP only for local or non-production environments. A restart is typically required for environment variable changes to take effect.
        </p>
      </div>
    </div>
  );
}

async function updateAppUrl(formData: FormData) {
  "use server";

  const scheme = formData.get("scheme");
  const hostPath = formData.get("hostPath");

  if (typeof scheme !== "string" || typeof hostPath !== "string") {
    redirect("/settings/ssl?updated=0");
  }

  const cleanedHostPath = hostPath
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^\/+|\/+$/g, "");

  const normalizedValue = `${scheme}://${cleanedHostPath || "localhost:3000"}`;

  try {
    new URL(normalizedValue);
  } catch {
    redirect("/settings/ssl?updated=0");
  }

  updateEnvValue("NEXTAUTH_URL", normalizedValue);
  redirect("/settings/ssl?updated=1");
}
