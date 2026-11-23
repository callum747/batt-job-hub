import Link from "next/link";
import { FileText } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";
import { ConnectGoogleButton } from "@/components/connect-google";
import { secondaryBtn } from "@/components/ui";
import { currentPerson } from "@/lib/auth";
import { errorText, googleConnected } from "@/lib/google/client";
import { readLedger } from "@/lib/google/ledger-run";
import { dueForChase, isOpen, type LedgerInvoice } from "@/lib/ledger";
import { gbp } from "@/lib/money";
import { todayUK } from "@/lib/jobs-rules";
import { LedgerList } from "./ledger-list";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const me = await currentPerson();
  const ok = me && me.email !== "preview@localhost" ? await googleConnected(me.email) : false;
  let data: { test: boolean; invoices: LedgerInvoice[] } | null = null;
  let problem = "";
  if (ok) {
    try {
      data = await readLedger(me!.email);
    } catch (e) {
      problem = errorText(e);
    }
  }
  const today = todayUK();
  const all = data?.invoices ?? [];
  const open = all.filter((i) => isOpen(i) || i.status === "Draft").sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const paid = all.filter((i) => i.status === "Paid").sort((a, b) => (b.paidDate ?? "").localeCompare(a.paidDate ?? "")).slice(0, 15);
  const owed = all.filter(isOpen).reduce((s, i) => s + (i.payable ?? 0), 0);
  const overdue = all.filter((i) => i.status === "Overdue");
  const chase = all.filter((i) => dueForChase(i, today));

  return (
    <>
      <PageHeader title="Invoices" intro="Straight from the 00 - Batt Job Hub ledger: who owes what, what's overdue, and chasers. Raise new invoices from the job." />
      {!ok ? (
        <div className="rounded-2xl border border-line p-5">
          <p className="mb-3">Connect Google to read the ledger.</p>
          <ConnectGoogleButton className={secondaryBtn}>Connect Google</ConnectGoogleButton>
        </div>
      ) : problem ? (
        <p className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3">Couldn&apos;t read the ledger. {problem}</p>
      ) : all.length === 0 ? (
        <EmptyState icon={FileText} title="No invoices yet" text="Raise one from a job's Quote & money tab." />
      ) : (
        <div className="space-y-8">
          {data?.test && <p className="rounded-xl bg-blue-soft px-4 py-3 text-[15px]">Test mode: this is the test copy of the ledger. Go live in Settings to see the real one.</p>}
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-line p-4"><dt className="text-muted">Owed to Batt</dt><dd className="text-[26px] font-semibold tabular-nums">{gbp(owed)}</dd></div>
            <div className="rounded-2xl border border-line p-4"><dt className="text-muted">Overdue</dt><dd className="text-[26px] font-semibold tabular-nums">{gbp(overdue.reduce((s, i) => s + (i.payable ?? 0), 0))}</dd><dd className="text-[14px] text-muted">{overdue.length} invoice{overdue.length === 1 ? "" : "s"}</dd></div>
            <div className="rounded-2xl border border-line p-4"><dt className="text-muted">To chase today</dt><dd className="text-[26px] font-semibold tabular-nums">{chase.length}</dd></div>
          </dl>
          <section>
            <h2 className="mb-3 text-[20px] font-semibold">Not paid yet</h2>
            {open.length ? <LedgerList items={open} today={today} /> : <p className="text-muted">Everything&apos;s paid.</p>}
            <p className="mt-2 text-[14px] text-muted">Late fees are worked out by the ledger from the T&amp;Cs (5% for each full week overdue). They&apos;re mentioned in chasers but never added to an invoice unless you choose to.</p>
          </section>
          {paid.length > 0 && (
            <section>
              <h2 className="mb-3 text-[20px] font-semibold">Recently paid</h2>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {paid.map((i) => (
                  <li key={i.number} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[15px]">
                    <span className="font-semibold">{i.number}</span>
                    <span className="min-w-0 flex-1">{i.client} <span className="text-muted">{i.type}</span></span>
                    <span className="tabular-nums">{gbp(i.payable ?? 0)}</span>
                    {/^\d+$/.test(i.quoteRef) && <Link href={`/jobs/${i.quoteRef}`} className="underline underline-offset-4">#{i.quoteRef}</Link>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
