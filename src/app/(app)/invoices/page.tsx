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
import { CisFromContractors, PaySubcontractor } from "./cis";
import { readCis } from "@/lib/google/cis-run";
import { statementMissing } from "@/lib/ledger";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const me = await currentPerson();
  const ok = me && me.email !== "preview@localhost" ? await googleConnected(me.email) : false;
  let data: { test: boolean; invoices: LedgerInvoice[] } | null = null;
  let cis: Awaited<ReturnType<typeof readCis>> | null = null;
  let problem = "";
  if (ok) {
    try {
      [data, cis] = await Promise.all([readLedger(me!.email), readCis(me!.email)]);
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
          {cis && (
            <section>
              <h2 className="mb-1 text-[20px] font-semibold">CIS</h2>
              <p className="mb-3 text-[15px] text-muted">Tax months run from the 6th to the 5th. Contractors owe us a statement by the 19th after the month they paid in.</p>
              <h3 className="mb-2 font-semibold">From contractors (they deduct from us){cis.received.some((r) => statementMissing(r, today)) ? <span className="ml-2 rounded-full bg-bad/15 px-3 py-1 text-[13px]">statements missing</span> : null}</h3>
              {cis.received.length ? <CisFromContractors rows={cis.received} today={today} /> : <p className="text-muted">No CIS invoices yet.</p>}
              <h3 className="mb-2 mt-6 font-semibold">Paying subcontractors (we deduct)</h3>
              {cis.subcontractors.length === 0 ? (
                <p className="text-muted">No subcontractors on the ledger&apos;s Subcontractors tab.</p>
              ) : (
                <>
                  <PaySubcontractor names={cis.subcontractors.map((x) => x.name)} today={today} />
                  {cis.subcontractors.some((x) => !x.email || !x.address || /legal name/i.test(x.notes)) && (
                    <p className="mt-3 rounded-xl bg-warn/10 px-4 py-3 text-[15px]">
                      Monthly CIS statements for {cis.subcontractors.filter((x) => !x.email || !x.address || /legal name/i.test(x.notes)).map((x) => x.name).join(", ")} can&apos;t be made yet: the Subcontractors tab is missing their full legal name, email or address, and Batt&apos;s employer&apos;s reference (from GPG) is needed too.
                    </p>
                  )}
                  {cis.paid.length > 0 && (
                    <ul className="mt-3 divide-y divide-line rounded-xl border border-line text-[15px]">
                      {cis.paid.slice(-10).reverse().map((x) => (
                        <li key={x.row} className="flex flex-wrap gap-x-3 px-4 py-2">
                          <span className="font-medium">{x.date}</span><span>{x.name}</span><span className="text-muted">gross {x.gross}, CIS {x.deducted}, paid {x.net}</span><span className="ml-auto text-muted">tax month ending {x.taxMonthEnding}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          )}
          {paid.length > 0 && (
            <section>
              <h2 className="mb-3 text-[20px] font-semibold">Recently paid</h2>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {paid.map((i) => (
                  <li key={i.number} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[15px]">
                    <span className="font-semibold">{i.number}</span>
                    <span className="min-w-0 flex-1">{i.client} <span className="text-muted">{i.type}</span></span>
                    <span className="tabular-nums">{gbp(i.payable ?? 0)}</span>
                    {i.jobNumber && <Link href={`/jobs/${i.jobNumber}`} className="underline underline-offset-4">#{i.jobNumber}</Link>}
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
