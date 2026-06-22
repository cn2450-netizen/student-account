"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteParentAccount } from "@/app/actions";

export function DeleteParentButton({ userId, name }: { userId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteParentAccount(userId);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
      } else {
        router.refresh();
      }
    });
  }

  if (error) {
    return <span className="text-xs text-rose-400">{error}</span>;
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm">
        <span className="text-rose-300">
          Delete <strong>{name}</strong> and all linked students and financial records?
          This cannot be undone.
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
          >
            {isPending ? "Deleting…" : "Yes, delete"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="rounded-lg border border-slate-600 px-3 py-1 text-xs text-slate-400 transition hover:border-slate-500 hover:text-slate-300 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-xs text-rose-500 transition hover:text-rose-400"
    >
      Delete account
    </button>
  );
}
