import { Inbox } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";
import { ConnectGoogleButton } from "@/components/connect-google";
import { secondaryBtn } from "@/components/ui";
import { currentPerson } from "@/lib/auth";
import { errorText, gmailConnected } from "@/lib/google/client";
import { listInbox, type InboxItem } from "@/lib/inbox";
import { assistantConfigured } from "@/lib/assistant/client";
import { InboxList } from "./inbox-list";
import { CheckNow, InvoiceQueue } from "./invoices";
import { invoiceSettings, queuedInvoices, recentlyFiled } from "@/lib/supplier-invoices";
import { gbp } from "@/lib/money";
import { ukDate } from "@/lib/jobs-rules";
import Link from "next/link";

export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const me = await currentPerson();
  const ok = me && me.email !== "preview@localhost" ? await gmailConnected(me.email) : false;
  let items: InboxItem[] = [];
  let problem = "";
  if (ok) {
    try {
      items = await listInbox(me!.email);
    } catch (e) {
      problem = errorText(e);
    }
  }
  const [inv, queue, filed] = await Promise.all([invoiceSettings(), queuedInvoices(), recentlyFiled()]);
  const invoicesOn = await gmailConnected(inv.mailbox);
  return (
    <>
      <PageHeader title="Inbox" intro="Emails from the last 30 days in your inbox that aren't on a job yet, and supplier invoices that need a person." />
      {!ok ? (
        <div className="rounded-2xl border border-line p-5">
          <p className="mb-3">Connect Google and tick the Gmail boxes to see your emails here. The app reads your inbox; it never sends or deletes.</p>
          <ConnectGoogleButton className={secondaryBtn}>Connect Google</ConnectGoogleButton>
        </div>
      ) : problem ? (
        <p className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3">{problem}</p>
      ) : items.length === 0 ? (
        <EmptyState icon={Inbox} title="Nothing to sort" text="Every recent email from outside Batt is on a job or has been cleared." />
      ) : (
        <InboxList items={items} ai={assistantConfigured()} />
      )}

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-semibold">Supplier invoices</h2>
            <p className="text-muted">
              {invoicesOn
                ? `Read from ${inv.mailbox} every 30 minutes while the app is open${inv.lastScan ? `; last checked ${new Date(inv.lastScan).toLocaleString("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}. Clear-cut invoices go straight on the job; the rest wait here.`
                : `Not switched on yet. Sign in to the app once as ${inv.mailbox}, press Connect Google and tick the Gmail boxes. Then wholesaler invoices land on their jobs by themselves.`}
            </p>
          </div>
          {invoicesOn && <CheckNow />}
        </div>
        {queue.length > 0 ? <InvoiceQueue items={queue} /> : invoicesOn && <p className="rounded-2xl border border-dashed border-line bg-surface px-5 py-6 text-center text-muted">Nothing to check.</p>}
        {filed.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-[16px] font-semibold">Recently put on jobs</h3>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {filed.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[15px]">
                  <span className="min-w-0 flex-1">
                    {f.supplier} {f.credit_note ? "credit note" : "invoice"} {f.invoice_number}{" "}
                    <span className="text-muted">{f.decided_by === "automatic" ? "automatically" : "by hand"}, {ukDate(f.created_at.slice(0, 10))}</span>
                  </span>
                  <span className="tabular-nums">{f.net === null ? "" : gbp(f.credit_note ? -Math.abs(f.net) : f.net)}</span>
                  {f.job_number && <Link href={`/jobs/${f.job_number}?tab=money`} className="font-semibold underline underline-offset-4">#{f.job_number}</Link>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}
