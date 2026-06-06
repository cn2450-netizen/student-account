"use client";

import { useState, useTransition } from "react";
import { unlockAccount } from "@/app/actions";

export function UnlockAccountButton({ userId }: { userId: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleClick = () => {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    setConfirmed(false);
    setError(null);
    startTransition(async () => {
      const res = await unlockAccount(userId);
      if (res.error) {
        setError(res.error);
      } else {
        setDone(true);
      }
    });
  };

  if (done) {
    return <span className="text-xs text-emerald-400">Unlocked — password change required</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={handleClick}
        disabled={isPending}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
          confirmed
            ? "bg-amber-600 hover:bg-amber-500 text-white"
            : "bg-cyan-700 hover:bg-cyan-600 text-white"
        }`}
      >
        {isPending ? "Unlocking…" : confirmed ? "Confirm unlock" : "Unlock"}
      </button>
      {confirmed && !isPending && (
        <button
          onClick={() => setConfirmed(false)}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          Cancel
        </button>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
