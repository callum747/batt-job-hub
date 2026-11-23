"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { Field, inputCls, primaryBtn, secondaryBtn, textareaCls } from "@/components/ui";
import { chaseStage, dueForChase, type LedgerInvoice } from "@/lib/ledger";
import { ukDate } from "@/lib/invoicing";
import { ledgerChaserStart, ledgerDraftChaser, ledgerMark } from "../actions";

const gbp = (n: number | null) => (n === null ? "–" : n.toLocaleString("en-GB", { style: "currency", currency: "GBP" }));

function Row({ i, today }: { i: LedgerInvoice; today: string }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [open, setOpen] = useState<"" | "chase" | "sent" | "paid">("");
  const [date, setDate] = useState(today);
  const [received, setReceived] = useState(i.payable === null ? "" : String(i.payable));
  const [e, setE] = useState<{ to: string; cc: string; subject: string; body: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  const due = dueForChase(i, today);
  const job = i.jobNumber;

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">{i.number}</span>
        <span className="min-w-0 flex-1">
          {i.client} <span className="text-muted">· {i.type}{job ? ` · #${job}` : i.quoteRef ? ` · ${i.quoteRef}` : ""}</span>
        </span>
        <span className="tabular-nums">{gbp(i.payable)}</span>
        <span className={`rounded-full px-3 py-1 text-[13px] font-medium ${i.status === "Overdue" ? "bg-bad/15" : "bg-surface"}`}>
          {i.status === "Overdue" ? `${i.daysOverdue} days overdue` : i.status === "Draft" ? "Not sent" : i.dueDate ? `Due ${ukDate(i.dueDate)}` : i.status}
        </span>
      </div>
      <p className="mt-1 text-[14px] text-muted">
        {i.lateFee ? `Late fee so far ${gbp(i.lateFee)}. ` : ""}
        {i.lastChased ? `Last chased ${ukDate(i.lastChased)}. ` : ""}
        {i.nextChase && i.status !== "Draft" ? (due ? "Chase today." : `Next chase ${ukDate(i.nextChase)}.`) : ""}
        {i.pdfUrl && <> <a href={i.pdfUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">PDF</a></>}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {i.status !== "Draft" && (
          <button
            type="button"
            disabled={pending}
            className={due ? primaryBtn : secondaryBtn}
            onClick={() =>
              run(async () => {
                setMsg(null);
                const r = await ledgerChaserStart(i.number);
                if (!r.ok) return setMsg({ ok: false, text: r.message });
                setE({ to: r.email.to, cc: r.email.cc, subject: r.email.subject, body: r.email.body });
                setOpen("chase");
              })
            }
          >
            <Mail className="h-5 w-5" aria-hidden="true" /> Chase{due ? ` (reminder ${chaseStage(i.daysOverdue)})` : ""}
          </button>
        )}
        {!i.sentDate && <button type="button" className={secondaryBtn} onClick={() => setOpen(open === "sent" ? "" : "sent")}>Mark sent</button>}
        <button type="button" className={secondaryBtn} onClick={() => setOpen(open === "paid" ? "" : "paid")}>Mark paid</button>
      </div>
      {open === "chase" && e && (
        <div className="mt-3 space-y-3 rounded-xl bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="To"><input value={e.to} onChange={(x) => setE({ ...e, to: x.target.value })} className={inputCls} /></Field>
            <Field label="Cc"><input value={e.cc} onChange={(x) => setE({ ...e, cc: x.target.value })} className={inputCls} /></Field>
          </div>
          <Field label="Subject"><input value={e.subject} onChange={(x) => setE({ ...e, subject: x.target.value })} className={inputCls} /></Field>
          <Field label="Message"><textarea value={e.body} onChange={(x) => setE({ ...e, body: x.target.value })} className={`${textareaCls} min-h-64`} /></Field>
          <button type="button" disabled={pending || !e.to.trim()} className={primaryBtn} onClick={() => run(async () => { const r = await ledgerDraftChaser(i.number, e); setMsg({ ok: r.ok, text: r.message, url: (r as { url?: string }).url }); if (r.ok) router.refresh(); })}>
            {pending ? "Saving…" : "Save as a draft in Gmail"}
          </button>
        </div>
      )}
      {(open === "sent" || open === "paid") && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label={open === "sent" ? "Date sent" : "Date paid"}><input type="date" value={date} onChange={(x) => setDate(x.target.value)} className={inputCls} /></Field>
          {open === "paid" && <Field label="Amount received (£)"><input inputMode="decimal" value={received} onChange={(x) => setReceived(x.target.value)} className={inputCls} /></Field>}
          <button type="button" disabled={pending} className={primaryBtn} onClick={() => run(async () => { const r = await ledgerMark(i.number, open, date, Number(received.replace(/[£,\s]/g, ""))); setMsg({ ok: r.ok, text: r.message }); if (r.ok) { setOpen(""); router.refresh(); } })}>
            Save
          </button>
        </div>
      )}
      {msg && (
        <p role="status" className={`mt-2 rounded-xl border px-4 py-2 text-[15px] ${msg.ok ? "border-good/30 bg-good/10" : "border-bad/30 bg-bad/10"}`}>
          {msg.text} {msg.url && <a href={msg.url} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">Open the draft</a>}
        </p>
      )}
    </li>
  );
}

export function LedgerList({ items, today }: { items: LedgerInvoice[]; today: string }) {
  return <ul className="divide-y divide-line rounded-xl border border-line bg-bg">{items.map((i) => <Row key={i.number} i={i} today={today} />)}</ul>;
}
