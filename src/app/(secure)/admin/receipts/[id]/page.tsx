import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/secure-page";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/print-button";

export default async function ReceiptDetailPage({ params }: { params: { id: string } }) {
  const user = await requireAuth();
  if (!can(user.role, "fundRequests") && !can(user.role, "allFunds")) redirect("/dashboard");

  const receipt = await prisma.emailReceipt.findUnique({ where: { id: params.id } });
  if (!receipt) notFound();

  const sentDate = new Date(receipt.sentAt).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Actions — hidden when printing */}
      <div className="no-print flex items-center gap-3">
        <Link href="/admin/receipts" className="text-sm text-slate-400 hover:text-slate-200">
          ← Back to Receipts
        </Link>
        <PrintButton />
      </div>

      {/* Receipt card */}
      <div className="print-receipt rounded-2xl border border-slate-700 bg-slate-900/70 p-6 space-y-5">
        {/* Header */}
        <div className="border-b border-slate-700 pb-4 space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                receipt.type === "deposit"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-cyan-500/15 text-cyan-400"
              }`}
            >
              {receipt.type === "deposit" ? "Deposit Receipt" : "Account Approval"}
            </span>
            <span className="text-xs text-slate-500">{sentDate}</span>
          </div>
          <p className="text-lg font-semibold text-slate-100">{receipt.subject}</p>
        </div>

        {/* Meta */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">To</dt>
            <dd className="mt-0.5 text-slate-200">{receipt.toName}</dd>
            <dd className="text-xs text-slate-400">{receipt.toEmail}</dd>
          </div>
          {receipt.studentName && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Student</dt>
              <dd className="mt-0.5 text-slate-200">{receipt.studentName}</dd>
            </div>
          )}
          {receipt.amount != null && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Amount</dt>
              <dd className="mt-0.5 text-xl font-semibold text-emerald-400">
                ${Number(receipt.amount).toFixed(2)}
              </dd>
            </div>
          )}
          {receipt.description && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Description</dt>
              <dd className="mt-0.5 text-slate-200">{receipt.description}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Email Delivered</dt>
            <dd className={`mt-0.5 font-medium ${receipt.emailSent ? "text-emerald-400" : "text-slate-500"}`}>
              {receipt.emailSent ? "Yes" : "No (SMTP not configured at time of send)"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Receipt ID</dt>
            <dd className="mt-0.5 font-mono text-xs text-slate-500">{receipt.id}</dd>
          </div>
        </dl>

        {/* Email body */}
        <div className="border-t border-slate-700 pt-4">
          <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">Email Body</p>
          <div
            className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-200 leading-relaxed [&_a]:text-cyan-400 [&_strong]:text-slate-100"
            dangerouslySetInnerHTML={{ __html: receipt.htmlBody }}
          />
        </div>
      </div>
    </div>
  );
}
