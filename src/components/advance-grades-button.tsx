"use client";

import { useState, useTransition } from "react";
import { advanceGrades } from "@/app/actions";

export function AdvanceGradesButton({ advancementDate = "July 1" }: { advancementDate?: string }) {
  const [result, setResult] = useState<{
    advanced?: number;
    graduated?: number;
    skipped?: string;
    error?: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);

  const handleClick = () => {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    setConfirmed(false);
    setResult(null);
    startTransition(async () => {
      const res = await advanceGrades();
      setResult(res);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={handleClick}
        disabled={isPending}
        className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
          confirmed
            ? "bg-amber-600 hover:bg-amber-500 text-white"
            : "bg-slate-700 hover:bg-slate-600 text-slate-100"
        }`}
      >
        {isPending
          ? "Advancing grades…"
          : confirmed
          ? "Confirm — advance all grades now"
          : `Advance Grades (${advancementDate} rollover)`}
      </button>

      {confirmed && !isPending && (
        <button
          onClick={() => setConfirmed(false)}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          Cancel
        </button>
      )}

      {result && (
        <p
          className={`text-sm ${
            result.error
              ? "text-rose-400"
              : result.skipped
              ? "text-amber-400"
              : "text-emerald-400"
          }`}
        >
          {result.error ??
            result.skipped ??
            `Done — ${result.advanced} student${result.advanced !== 1 ? "s" : ""} advanced, ${result.graduated} graduated.`}
        </p>
      )}
    </div>
  );
}
