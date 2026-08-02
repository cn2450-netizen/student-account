"use client";

import { useState, useTransition } from "react";
import { runBackupNow } from "@/app/actions";

export function BackupNowButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleClick = () => {
    setResult(null);
    startTransition(async () => {
      const res = await runBackupNow();
      if (res.error) {
        setResult({ ok: false, message: res.error });
      } else {
        setResult({ ok: true, message: `Backup created: ${res.filename}` });
      }
    });
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
      >
        {isPending ? "Backing up…" : "Back Up Now"}
      </button>
      {result && (
        <p className={`text-sm ${result.ok ? "text-emerald-400" : "text-rose-400"}`}>{result.message}</p>
      )}
    </div>
  );
}
