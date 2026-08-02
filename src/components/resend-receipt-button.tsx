"use client";

import { useState, useTransition } from "react";
import { resendReceiptEmail } from "@/app/actions";

export function ResendReceiptButton({ receiptId }: { receiptId: string }) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleResend = () => {
    setError(null);
    startTransition(async () => {
      const result = await resendReceiptEmail(receiptId);
      if (result.error) {
        setState("error");
        setError(result.error);
      } else {
        setState("sent");
      }
    });
  };

  if (state === "sent") {
    return <span className="text-xs text-emerald-400">Sent ✓</span>;
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        onClick={handleResend}
        disabled={isPending}
        className="text-xs text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
      >
        {isPending ? "Sending…" : "Resend"}
      </button>
      {state === "error" && error && (
        <span className="text-xs text-rose-400">{error}</span>
      )}
    </div>
  );
}
