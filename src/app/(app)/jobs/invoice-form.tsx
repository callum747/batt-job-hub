"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Mail, Plus, Trash2 } from "lucide-react";
import { Field, inputCls, primaryBtn, secondaryBtn, textareaCls } from "@/components/ui";
import { addDays, finalAmount, totals, ukDate, type InvoiceType, type Line, type VatTreatment } from "@/lib/invoicing";
import type { InvoiceStart } from "@/lib/invoice-start";
import type { InvoiceEmailStart } from "@/lib/invoice-email";
import { invoiceDraftEmail, invoiceMake, invoiceMark, invoiceRetryLedger } from "../actions";

const gbp = (n: number) => n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
const small = "h-11 w-full rounded-lg border border-line bg-bg px-3 text-[15px] outline-none focus:border-blue";
const round2 = (n: number) => Math.round(n * 100) / 100;

type Choice = { key: string; label: string; type: InvoiceType; stageLabel: string; lines: Line[] };

function choices(s: InvoiceStart): Choice[] {
  const ref = s.quoteRef ? `quotation ${s.quoteRef}` : "the quotation";
  const out: Choice[] = [];
  const open = s.stages.filter((st) => !st.done);
  // Every stage but the last is its percentage; the last is whatever is left (so variations and rounding land there).
  open.forEach((st) => {
    const isLast = st === s.stages[s.stages.length - 1];
    if (isLast) return;
    const deposit = /^deposit/i.test(st.label);
    out.push({ key: st.label, label: `${st.label} (${st.pct}%): ${gbp(st.amount)}`, type: deposit ? "Deposit" : "Stage payment", stageLabel: st.label, lines: [{ description: `${st.label.replace(/, on acceptance/i, "")} (${st.pct}%) for works per ${ref}`, qty: 1, unit: st.amount }] });
  });
  const last = s.stages[s.stages.length - 1];
  if (s.stages.length && !last.done) {
    const survey = s.template === "surveyProposal";
    const lines: Line[] = s.invoicedNet === 0 && s.variations.length === 0
      ? [{ description: survey ? `Survey per proposal ${s.quoteRef}` : `Works per ${ref}`, qty: 1, unit: s.quoteNet }]
      : [
          { description: `Balance of ${ref}`, qty: 1, unit: finalAmount(s.quoteNet, [], [s.invoicedNet]) },
          ...s.variations.map((v) => ({ description: `Variation: ${v.description}`, qty: 1, unit: v.amount })),
        ];
    out.push({ key: "final", label: `${last.label} (final): ${gbp(s.finalAmount)}`, type: survey ? "Survey" : "Final", stageLabel: last.label, lines });
  }
  out.push({ key: "day", label: "Day rate", type: "Day rate", stageLabel: "", lines: [{ description: "Electrician day rate", qty: 1, unit: s.dayRate }, ...(s.miles ? [{ description: `Mileage: ${s.miles} miles round trip at ${Math.round(s.perMile * 100)}p`, qty: 1, unit: round2(s.miles * s.perMile) }] : [])] });
  out.push({ key: "variation", label: "Variation", type: "Variation", stageLabel: "", lines: [{ description: "Variation: ", qty: 1, unit: 0 }] });
  out.push({ key: "other", label: "Other", type: "Other", stageLabel: "", lines: [{ description: "", qty: 1, unit: 0 }] });
  return out;
}

export function NewInvoice({ jobId, start }: { jobId: string; start: InvoiceStart }) {
  const router = useRouter();
  const options = useMemo(() => choices(start), [start]);
  const [pick, setPick] = useState(options[0].key);
  const chosen = options.find((o) => o.key === pick)!;
  const [lines, setLines] = useState<Line[]>(chosen.lines);
  const [vat, setVat] = useState<"" | "vat" | "cis">(start.client.contractor ? "" : "vat");
  const share = start.quoteNet ? lines.reduce((s, l) => s + l.qty * l.unit, 0) / start.quoteNet : 0;
  const [labour, setLabour] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(start.today);
  const [supplyDate, setSupplyDate] = useState(start.today);
  const [terms, setTerms] = useState(String(start.termsDays));
  const [email, setEmail] = useState(start.client.email);
  const [address, setAddress] = useState(start.client.address);
  const [site, setSite] = useState(start.site);
  const [pending, run] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string; problems?: string[]; pdfUrl?: string; docUrl?: string } | null>(null);

  const cis = vat === "cis";
  const t = totals(lines, cis ? "Reverse charge" : "Standard 20%", cis ? Number(labour) || 0 : null);
  const suggestedLabour = start.labourSell !== null ? round2(start.labourSell * Math.min(1, share)) : null;

  function choose(key: string) {
    setPick(key);
    setLines(options.find((o) => o.key === key)!.lines);
    setLabour("");
    setMsg(null);
  }
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-5">
      {start.test && <p className="rounded-xl bg-blue-soft px-4 py-3 text-[15px]">Test mode: this makes TEST-INV numbers in the test folder and a test copy of the ledger. The real ledger and numbers aren&apos;t touched.</p>}
      <div>
        <p className="mb-2 font-medium">What&apos;s it for?</p>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <button key={o.key} type="button" onClick={() => choose(o.key)} className={`rounded-full px-4 py-2 text-[15px] font-medium ${pick === o.key ? "bg-blue text-blue-ink" : "bg-surface"}`}>
              {o.label}
            </button>
          ))}
        </div>
        {start.stages.length === 0 && <p className="mt-2 text-[14px] text-muted">No quote has been made from the app on this job, so there are no stages to follow. Use Day rate, Variation or Other, and put the amounts in.</p>}
      </div>

      <div>
        <p className="mb-2 font-medium">Lines</p>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_70px_120px_40px] items-center gap-2">
              <input aria-label="Description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} className={small} />
              <input aria-label="Quantity" inputMode="decimal" value={String(l.qty)} onChange={(e) => setLine(i, { qty: Number(e.target.value) || 0 })} className={`${small} text-right`} />
              <input aria-label="Unit price ex VAT" inputMode="decimal" value={String(l.unit)} onChange={(e) => setLine(i, { unit: Number(e.target.value.replace(/[£,]/g, "")) || 0 })} className={`${small} text-right`} />
              <button type="button" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} className="flex h-11 items-center justify-center rounded-lg text-muted hover:bg-surface disabled:opacity-30">
                <Trash2 className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setLines((ls) => [...ls, { description: "", qty: 1, unit: 0 }])} className="mt-2 inline-flex items-center gap-1 text-[15px] font-medium underline underline-offset-4">
          <Plus className="h-4 w-4" aria-hidden="true" /> Add a line
        </button>
        <p className="mt-1 text-[14px] text-muted">Prices are before VAT. Amounts come from the quote; change them only if what was agreed is different.</p>
        {lines.length > (vat === "cis" ? 2 : 7) && (
          <p className="mt-2 rounded-xl bg-warn/10 px-4 py-2 text-[14px]">The invoice must fit on one page{vat === "cis" ? ", and a CIS invoice has room for about 2 lines" : ""}. Combine lines (e.g. one line for all the variations) if it won&apos;t fit.</p>
        )}
      </div>

      <fieldset>
        <legend className="mb-2 font-medium">VAT or CIS?</legend>
        {start.client.contractor && vat === "" && (
          <p className="mb-2 rounded-xl bg-warn/10 px-4 py-3 text-[15px]">{start.client.name} is a main contractor. Is {start.client.name} deducting CIS, and are they the end user? Check before choosing.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <label className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 ${vat === "vat" ? "border-blue bg-blue-soft" : "border-line"}`}>
            <input type="radio" name="vat" checked={vat === "vat"} onChange={() => setVat("vat")} /> Standard VAT invoice (20%)
          </label>
          <label className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 ${vat === "cis" ? "border-blue bg-blue-soft" : "border-line"}`}>
            <input type="radio" name="vat" checked={vat === "cis"} onChange={() => setVat("cis")} /> CIS invoice (reverse charge, they deduct 20% of labour)
          </label>
        </div>
        {cis && (
          <div className="mt-3 max-w-sm">
            <Field label="Labour in this invoice (£, before VAT)" hint={suggestedLabour !== null ? `The pricing sheet's labour is ${gbp(start.labourSell!)}; this invoice's share of it is about ${gbp(suggestedLabour)}. Check against the sheet; materials don't count.` : "From the pricing sheet. Materials don't count."}>
              <input inputMode="decimal" value={labour} onChange={(e) => setLabour(e.target.value)} className={inputCls} placeholder={suggestedLabour !== null ? String(suggestedLabour) : ""} />
            </Field>
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Invoice date"><input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={inputCls} /></Field>
        <Field label="Date of supply" hint={chosen.type === "Final" ? "The completion date." : chosen.type === "Survey" ? "The survey date." : chosen.type === "Day rate" ? "The last day worked." : "Usually the invoice date."}>
          <input type="date" value={supplyDate} onChange={(e) => setSupplyDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Payment terms (days)" hint={invoiceDate ? `Due ${ukDate(addDays(invoiceDate, Number(terms) || 0))}` : undefined}>
          <input inputMode="numeric" value={terms} onChange={(e) => setTerms(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Billed to: ${start.client.name || "no client on this job"}`} hint="Billing address. Saved on the client for next time.">
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} className={`${textareaCls} min-h-24`} placeholder={"Street\nTown\nPostcode"} />
        </Field>
        <div className="space-y-4">
          <Field label="Client email"><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} inputMode="email" /></Field>
          <Field label="Site / job"><input value={site} onChange={(e) => setSite(e.target.value)} className={inputCls} /></Field>
        </div>
      </div>

      <dl className="max-w-sm divide-y divide-line rounded-xl border border-line bg-bg text-[15px]">
        <div className="flex justify-between px-4 py-2"><dt>Subtotal</dt><dd className="tabular-nums">{gbp(t.net)}</dd></div>
        <div className="flex justify-between px-4 py-2"><dt>{cis ? "VAT (reverse charge)" : "VAT @ 20%"}</dt><dd className="tabular-nums">{gbp(t.vat)}</dd></div>
        <div className="flex justify-between px-4 py-2 font-semibold"><dt>Total due</dt><dd className="tabular-nums">{gbp(t.gross)}</dd></div>
        {cis && <div className="flex justify-between px-4 py-2"><dt>Less CIS (20% of labour)</dt><dd className="tabular-nums">–{gbp(t.cisDeduction ?? 0)}</dd></div>}
        {cis && <div className="flex justify-between px-4 py-2 font-semibold"><dt>Amount payable</dt><dd className="tabular-nums">{gbp(t.payable)}</dd></div>}
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || vat === "" || !start.client.name}
          className={primaryBtn}
          onClick={() =>
            run(async () => {
              setMsg(null);
              const r = await invoiceMake(jobId, {
                type: chosen.type, stageLabel: chosen.stageLabel, vat: cis ? "Reverse charge" : ("Standard 20%" as VatTreatment), cis, cisLabour: cis ? Number(labour) : null,
                invoiceDate, supplyDate, termsDays: Number(terms), clientName: start.client.name, clientEmail: email, billingAddress: address, site, lines, notes: "",
              }, start.client.id);
              setMsg({ ok: r.ok, text: r.message, problems: r.problems, pdfUrl: (r as { pdfUrl?: string }).pdfUrl, docUrl: (r as { docUrl?: string }).docUrl });
              if (r.ok) router.refresh();
            })
          }
        >
          <FileText className="h-5 w-5" aria-hidden="true" /> {pending ? "Making the invoice…" : "Make the invoice"}
        </button>
        <span className="text-[14px] text-muted">Numbered with the next number when it&apos;s made, filed in the VAT quarter folder, and added to the ledger.</span>
      </div>
      {msg && (
        <div role="status" className={`rounded-xl border px-4 py-3 text-[15px] ${msg.ok ? "border-good/30 bg-good/10" : "border-bad/30 bg-bad/10"}`}>
          <p>{msg.text}</p>
          {msg.problems && <ul className="mt-1 list-disc pl-5">{msg.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <p className="mt-1 flex gap-4">
            {msg.pdfUrl && <a href={msg.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold underline underline-offset-4">PDF <ExternalLink className="h-4 w-4" aria-hidden="true" /></a>}
            {msg.docUrl && <a href={msg.docUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">Doc</a>}
          </p>
        </div>
      )}
    </div>
  );
}

export type InvoiceListRow = {
  id: string; label: string; type: string; stage_label: string; cis: boolean; net: number; gross: number; payable: number; status: string;
  invoice_date: string; due_date: string; sent_date: string | null; paid_date: string | null; doc_url: string; pdf_url: string; ledger_row: number | null; note: string;
  email: InvoiceEmailStart | null;
};

function InvoiceRow({ inv, today }: { inv: InvoiceListRow; today: string }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [open, setOpen] = useState<"" | "sent" | "paid" | "email">("");
  const [date, setDate] = useState(today);
  const [e, setE] = useState(inv.email ? { to: inv.email.to, cc: inv.email.cc, subject: inv.email.subject, body: inv.email.body } : null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  const overdue = inv.status === "sent" && inv.due_date < today;
  const status = inv.status === "failed" ? "Not made" : inv.status === "paid" ? `Paid ${ukDate(inv.paid_date!)}` : overdue ? "Overdue" : inv.status === "sent" ? `Sent ${ukDate(inv.sent_date!)}` : "Made, not sent";

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">{inv.label}</span>
        <span className="text-[15px]">{inv.stage_label || inv.type}</span>
        <span className="tabular-nums">{gbp(inv.gross)}{inv.cis ? ` (${gbp(inv.payable)} after CIS)` : ""}</span>
        <span className={`rounded-full px-3 py-1 text-[13px] font-medium ${inv.status === "paid" ? "bg-good/15" : overdue || inv.status === "failed" ? "bg-bad/15" : "bg-surface"}`}>{status}</span>
        <span className="ml-auto flex gap-3 text-[15px]">
          {inv.pdf_url && <a href={inv.pdf_url} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">PDF</a>}
          {inv.doc_url && <a href={inv.doc_url} target="_blank" rel="noreferrer" className="underline underline-offset-4">Doc</a>}
        </span>
      </div>
      {inv.status === "failed" && <p className="mt-1 text-[14px] text-muted">{inv.note} Its number will be used for the next invoice.</p>}
      {["made", "sent", "paid"].includes(inv.status) && inv.ledger_row === null && (
        <p className="mt-1 text-[14px]">
          Not in the ledger yet.{" "}
          <button type="button" disabled={pending} className="font-semibold underline underline-offset-4" onClick={() => run(async () => { const r = await invoiceRetryLedger(inv.id); setMsg({ ok: r.ok, text: r.message }); router.refresh(); })}>Add it now</button>
        </p>
      )}
      {["made", "sent"].includes(inv.status) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {inv.email && <button type="button" className={secondaryBtn} onClick={() => setOpen(open === "email" ? "" : "email")}><Mail className="h-5 w-5" aria-hidden="true" /> Email it</button>}
          {inv.status === "made" && <button type="button" className={secondaryBtn} onClick={() => setOpen(open === "sent" ? "" : "sent")}>Mark sent</button>}
          <button type="button" className={secondaryBtn} onClick={() => setOpen(open === "paid" ? "" : "paid")}>Mark paid</button>
        </div>
      )}
      {(open === "sent" || open === "paid") && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label={open === "sent" ? "Date sent" : "Date paid"}><input type="date" value={date} onChange={(x) => setDate(x.target.value)} className={inputCls} /></Field>
          <button type="button" disabled={pending} className={primaryBtn} onClick={() => run(async () => { const r = await invoiceMark(inv.id, open, date); setMsg({ ok: r.ok, text: r.message }); if (r.ok) { setOpen(""); router.refresh(); } })}>
            Save
          </button>
          {open === "paid" && <p className="w-full text-[14px] text-muted">Check the amount received matches {gbp(inv.payable)}. If it doesn&apos;t, don&apos;t mark it paid; it may be a part payment.</p>}
        </div>
      )}
      {open === "email" && e && inv.email && (
        <div className="mt-3 space-y-3 rounded-xl bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="To"><input value={e.to} onChange={(x) => setE({ ...e, to: x.target.value })} className={inputCls} /></Field>
            <Field label="Cc"><input value={e.cc} onChange={(x) => setE({ ...e, cc: x.target.value })} className={inputCls} /></Field>
          </div>
          <Field label="Subject"><input value={e.subject} onChange={(x) => setE({ ...e, subject: x.target.value })} className={inputCls} /></Field>
          <Field label="Message"><textarea value={e.body} onChange={(x) => setE({ ...e, body: x.target.value })} className={`${textareaCls} min-h-64`} /></Field>
          <button type="button" disabled={pending || !e.to.trim()} className={primaryBtn} onClick={() => run(async () => { const r = await invoiceDraftEmail(inv.id, e); setMsg({ ok: r.ok, text: r.message, url: (r as { url?: string }).url }); })}>
            <Mail className="h-5 w-5" aria-hidden="true" /> {pending ? "Saving…" : "Save as a draft in Gmail"}
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

export function InvoiceList({ items, today }: { items: InvoiceListRow[]; today: string }) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-bg">
      {items.map((i) => <InvoiceRow key={i.id} inv={i} today={today} />)}
    </ul>
  );
}
