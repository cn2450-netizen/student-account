"use client";

import { useActionState } from "react";
import { saveBackupConfig } from "@/app/actions";

type Props = {
  destinationPath: string;
  scheduleEnabled: boolean;
  frequencyHours: number;
  retentionCount: number;
};

export function BackupScheduleForm({ destinationPath, scheduleEnabled, frequencyHours, retentionCount }: Props) {
  const [state, action, pending] = useActionState(saveBackupConfig, { error: undefined, success: undefined });

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <p className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-400">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-900/40 px-3 py-2 text-sm text-emerald-400">Backup settings saved.</p>
      )}

      <div>
        <label htmlFor="destinationPath" className="block text-sm font-medium text-slate-300">
          Destination Path
        </label>
        <input
          id="destinationPath"
          name="destinationPath"
          defaultValue={destinationPath}
          placeholder="/mnt/backup-usb or /mnt/nas-backup or /var/backups/moneyfinder"
          className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200 outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30"
        />
        <p className="mt-1 text-xs text-slate-500">
          A directory on the server — local disk, a mounted USB drive, or a mounted NFS/SMB share.
          The mount itself (if using USB or a network share) must already be set up at the OS level;
          the app just writes to this path. It must be writable by the app&apos;s system user.
        </p>
      </div>

      <label className="inline-flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200">
        <input
          name="scheduleEnabled"
          type="checkbox"
          defaultChecked={scheduleEnabled}
          className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500"
        />
        Enable scheduled backups
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="frequencyHours" className="block text-sm font-medium text-slate-300">
            Frequency (hours)
          </label>
          <input
            id="frequencyHours"
            name="frequencyHours"
            type="number"
            min={1}
            step={1}
            defaultValue={frequencyHours}
            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200 outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30"
          />
          <p className="mt-1 text-xs text-slate-500">e.g. 24 for daily, 168 for weekly.</p>
        </div>
        <div>
          <label htmlFor="retentionCount" className="block text-sm font-medium text-slate-300">
            Keep last N backups
          </label>
          <input
            id="retentionCount"
            name="retentionCount"
            type="number"
            min={1}
            step={1}
            defaultValue={retentionCount}
            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200 outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30"
          />
          <p className="mt-1 text-xs text-slate-500">Older backups beyond this count are deleted automatically.</p>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save Backup Settings"}
      </button>
    </form>
  );
}
