import { requirePermission } from "@/lib/secure-page";
import { getBackupConfig, listBackupFiles } from "@/lib/backup";
import { BackupScheduleForm } from "@/components/backup-schedule-form";
import { BackupNowButton } from "@/components/backup-now-button";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function BackupsPage() {
  await requirePermission("settings");

  const cfg = await getBackupConfig();
  const files = await listBackupFiles(cfg.destinationPath);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Backups</h2>
        <p className="mt-1 text-sm text-slate-400">
          Back up the full database — students, fundraising, expenses, users, receipts, everything —
          to a local path, USB drive, or mounted network share.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-cyan-300">Manual Backup</h3>
          <p className="text-sm text-slate-400">
            Runs immediately, using the destination path configured below.
          </p>
        </div>
        <BackupNowButton />
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-cyan-300">Backup Settings</h3>
          <p className="text-sm text-slate-400">
            Configure where backups go and, optionally, how often they run automatically.
          </p>
          {cfg.lastRunAt && (
            <p className="mt-2 text-xs text-slate-500">
              Last run: {cfg.lastRunAt.toLocaleString()} —{" "}
              <span className={cfg.lastRunStatus === "success" ? "text-emerald-400" : "text-rose-400"}>
                {cfg.lastRunStatus === "success" ? "succeeded" : `failed (${cfg.lastRunError})`}
              </span>
            </p>
          )}
        </div>
        <BackupScheduleForm
          destinationPath={cfg.destinationPath}
          scheduleEnabled={cfg.scheduleEnabled}
          frequencyHours={cfg.frequencyHours}
          retentionCount={cfg.retentionCount}
        />
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/70 overflow-hidden">
        <div className="border-b border-slate-700 px-5 py-3">
          <h3 className="font-semibold text-cyan-300">Existing Backups</h3>
        </div>
        {!cfg.destinationPath ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            Set a destination path above to see backups here.
          </p>
        ) : files.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            No backups found at <code className="rounded bg-slate-800 px-1">{cfg.destinationPath}</code>.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Size</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {files.map((f) => (
                <tr key={f.name} className="hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">{f.name}</td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{f.mtime.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-slate-400">{formatBytes(f.size)}</td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/api/backup/download?file=${encodeURIComponent(f.name)}`}
                      className="text-xs text-cyan-400 hover:text-cyan-300"
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
