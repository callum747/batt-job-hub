"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw, X } from "lucide-react";
import { inputCls, primaryBtn, secondaryBtn } from "@/components/ui";
import { ukDate } from "@/lib/jobs-rules";
import type { QueuedInvoice } from "@/lib/supplier-invoices";
import { invoiceFile, invoiceIgnore, invoicesCheckNow } from "../actions";

const gbp = (n: number | null) => (n === null ? "?" : n.toLocaleString("en-GB", { style: "currency", currency: "GBP" }));

export function CheckNow() {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        className={secondaryBtn}
        onClick={() =>
          run(async () => {
            const r = await invoicesCheckNow();
            setMsg(r.message);
            router.refresh();
          })
        }
      >
        <RefreshCw className={`h-5 w-5 ${pending ? "animate-spin" : ""}`} aria-hidden="true" /> {pending ? "Checking…" : "Check now"}
      </button>
      {msg && <span role="status" className="text-[15px]">{msg}</span>}
    </div>
  );
}

function Row({ inv, onDone }: { inv: QueuedInvoice; onDone: (msg: string) => void }) {
  // If the delivery address points at one job, it's filled in ready to confirm.
  const [job, setJob] = useState(inv.suggested_job ? String(inv.suggested_job) : "");
  const [net, setNet] = useState(inv.net === null ? "" : String(Math.abs(inv.net)));
  const [problem, setProblem] = useState("");
  const [pending, run] = useTransition();
  const link = `https://mail.google.com/mail/?authuser=${encodeURIComponent(inv.mailbox)}#all/${inv.message_id}`;
  return (
    <li className="rounded-2xl border border-line bg-bg shadow-card p-4 md:p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold">
          {inv.supplier || inv.email_from} {inv.credit_note ? "credit note" : "invoice"} {inv.invoice_number}
        </span>
        <span className="text-[15px] tabular-nums">
          {gbp(inv.net)} + VAT {gbp(inv.vat)} = {gbp(inv.gross)}
        </span>
        <span className="ml-auto text-[14px] text-muted">{ukDate(inv.invoice_date ?? inv.received)}</span>
      </div>
      <p className="mt-1 text-[15px] text-muted">
        {inv.order_reference ? `Order ref "${inv.order_reference}". ` : ""}
        <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
          {inv.attachment || "the email"} <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
        <span className="block text-[13px]">Only someone signed in to Gmail as {inv.mailbox} can open the email.</span>
      </p>
      <p className="mt-2 rounded-xl bg-warn/10 px-3 py-2 text-[15px]">Why it needs you: {inv.reason}</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1.5 block text-[15px] font-medium">Job number</span>
          <input value={job} onChange={(e) => setJob(e.target.value)} className={`${inputCls} w-32`} placeholder="559" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[15px] font-medium">Amount before VAT (£)</span>
          <input value={net} onChange={(e) => setNet(e.target.value)} className={`${inputCls} w-40`} inputMode="decimal" />
        </label>
        <button
          type="button"
          disabled={pending || !job.trim() || !net.trim()}
          className={primaryBtn}
          onClick={() =>
            run(async () => {
              const r = await invoiceFile(inv.id, job, Number(net.replace(/[£,\s]/g, "")));
              if (r.ok) onDone(r.message);
              else setProblem(r.message);
            })
          }
        >
          Put on job
        </button>
        <button type="button" disabled={pending} className={secondaryBtn} onClick={() => run(async () => { await invoiceIgnore(inv.id); onDone("Marked as not a job cost."); })}>
          <X className="h-5 w-5" aria-hidden="true" /> Not a job cost
        </button>
      </div>
      {inv.credit_note && <p className="mt-2 text-[14px] text-muted">It&apos;s a credit note, so it goes on the job as a minus amount.</p>}
      {problem && <p className="mt-3 rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-[15px]">{problem}</p>}
    </li>
  );
}

export function InvoiceQueue({ items }: { items: QueuedInvoice[] }) {
  const [done, setDone] = useState<Record<string, string>>({});
  return (
    <ul className="space-y-4">
      {items.map((inv) =>
        done[inv.id] ? (
          <li key={inv.id} role="status" className="rounded-2xl border border-good/30 bg-good/10 px-4 py-3 text-[15px]">
            <b>{inv.supplier} {inv.invoice_number}</b>: {done[inv.id]}
          </li>
        ) : (
          <Row key={inv.id} inv={inv} onDone={(m) => setDone((d) => ({ ...d, [inv.id]: m }))} />
        ),
      )}
    </ul>
  );
}
