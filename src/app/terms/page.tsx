import Link from "next/link";
import { getCurrentSession } from "@/lib/auth";

export const metadata = {
  title: "Terms & Conditions — Student Account",
};

export default async function TermsPage() {
  const session = await getCurrentSession();
  const isLoggedIn = !!session?.user;
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Terms &amp; Conditions</h1>
          <p className="mt-1 text-sm text-slate-400">Student Account Portal</p>
        </div>

        <div className="space-y-6 text-sm text-slate-300 leading-relaxed">

          <section className="space-y-2">
            <h2 className="font-semibold text-slate-100">1. Purpose of This Account</h2>
            <p>
              This account is provided for administration purposes only. It is used to track
              fundraising activity, expenses, and fund requests on behalf of enrolled students.
              The account has <strong className="text-slate-100">no cash value</strong> and does
              not constitute a bank account, savings account, or financial instrument of any kind.
              Balances displayed are records of tracked activity and do not represent money held on
              deposit by the organization.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-slate-100">2. Eligible Fund Sources</h2>
            <p>
              All fundraising contributions credited to an account must originate from either:
            </p>
            <ul className="ml-4 list-disc space-y-1 text-slate-300">
              <li>The <strong className="text-slate-100">account holder</strong> (the registered parent or guardian), or</li>
              <li>One of the <strong className="text-slate-100">named students</strong> linked to this account.</li>
            </ul>
            <p>
              Contributions from third parties — including but not limited to grandparents, other
              family members, friends, or external donors — <strong className="text-slate-100">cannot be accepted
              or credited</strong> to this account under any circumstances.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-slate-100">3. No Cash Value or Transferability</h2>
            <p>
              Account balances are administrative records only. They cannot be redeemed for cash,
              transferred to a third party, or carried over outside of the processes defined by the
              organization. Any balance remaining at the time a student graduates or leaves the
              program is subject to review and approval by the Treasurer before any disposition is
              made.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-slate-100">4. Account Holder Responsibility</h2>
            <p>
              By creating an account, you confirm that you are the parent or legal guardian of the
              students registered under this account. You are responsible for the accuracy of
              information provided and for ensuring that all activity associated with your account
              complies with these terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-slate-100">5. Amendments</h2>
            <p>
              These terms may be updated at any time. Continued use of the portal following any
              update constitutes acceptance of the revised terms.
            </p>
          </section>

        </div>

        <div className="border-t border-slate-800 pt-6">
          <Link
            href={isLoggedIn ? "/dashboard" : "/register"}
            className="text-sm text-cyan-400 hover:text-cyan-300 underline"
          >
            {isLoggedIn ? "← Back to my account" : "← Back to registration"}
          </Link>
        </div>
      </div>
    </div>
  );
}
