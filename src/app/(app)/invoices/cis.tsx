"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, inputCls, primaryBtn, secondaryBtn } from "@/components/ui";
import { statementMissing, type CisReceived } from "@/lib/ledger";
import { ukDate } from "@/lib/invoicing";
import { cisFileStatement, cisPaySubcontractor, cisRequest } from "../actions";

const gbp = (n: number | null) => (n === null ? "–" : n.toLocaleString("en-GB", { style: "currency", currency: "GBP" }));
type Msg = { ok: boolean; text: string; url?: string } | null;

function Note({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role="status" className={`mt-2 rounded-xl border px-4 py-2 text-[15px] ${msg.ok ? "border-good/30 bg-good/10" : "border-bad/30 bg-bad/10"}`}>
      {msg.text} {msg.url && <a href={msg.url} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">Open</a>}
    </p>
  );
}

function Contractor({ name, rows, today }: { name: string; rows: CisReceived[]; today: string }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [filing, setFiling] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const missing = rows.filter((r) => statementMissing(r, today));
  const open = rows.filter((r) => !r.statementReceived);
  return (
    <li className="px-4 py-3">
      <p className="font-semibold">{name}</p>
      <ul className="mt-1 space-y-1 text-[15px]">
        {rows.map((r) => (
          <li key={r.invoice} className="flex flex-wrap gap-x-3">
            <span className="font-medium">{r.invoice}</span>
            <span className="text-muted">labour {gbp(r.labour)}, CIS {gbp(r.deducted)}</span>
            <span>
              {!r.paidDate ? "Not paid yet" : r.statementReceived ? `Statement received ${ukDate(r.statementReceived)}` : statementMissing(r, today) ? <b className="text-bad">Statement overdue (due {ukDate(r.statementDue!)})</b> : `Paid ${ukDate(r.paidDate)}, statement due ${r.statementDue ? ukDate(r.statementDue) : "by the 19th"}`}
            </span>
            {r.statementFile && <a href={r.statementFile} target="_blank" rel="noreferrer" className="underline underline-offset-4">Statement</a>}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        {missing.length > 0 && (
          <button type="button" disabled={pending} className={primaryBtn} onClick={() => run(async () => { const r = await cisRequest(name); setMsg({ ok: r.ok, text: r.message, url: (r as { url?: string }).url }); })}>
            Ask for the statement
          </button>
        )}
        {open.some((r) => r.paidDate) && <button type="button" className={secondaryBtn} onClick={() => setFiling(!filing)}>Statement arrived</button>}
      </div>
      {filing && (
        <form
          className="mt-3 space-y-3 rounded-xl bg-surface p-4"
          action={(f) =>
            run(async () => {
              const r = await cisFileStatement(f);
              setMsg({ ok: r.ok, text: r.message, url: (r as { url?: string }).url });
              if (r.ok) { setFiling(false); router.refresh(); }
            })
          }
        >
          <fieldset>
            <legend className="mb-1 font-medium">Which invoices does it cover?</legend>
            {open.filter((r) => r.paidDate).map((r) => (
              <label key={r.invoice} className="mr-4 inline-flex items-center gap-2"><input type="checkbox" name="invoice" value={r.invoice} defaultChecked /> {r.invoice}</label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Date it arrived"><input type="date" name="date" defaultValue={today} className={inputCls} /></Field>
            <Field label="The statement (PDF)"><input type="file" name="file" accept="application/pdf" className="block py-2 text-[15px]" /></Field>
            <button type="submit" disabled={pending} className={primaryBtn}>{pending ? "Filing…" : "File it"}</button>
          </div>
        </form>
      )}
      <Note msg={msg} />
    </li>
  );
}

export function CisFromContractors({ rows, today }: { rows: CisReceived[]; today: string }) {
  const names = [...new Set(rows.map((r) => r.contractor))];
  return <ul className="divide-y divide-line rounded-xl border border-line bg-bg">{names.map((n) => <Contractor key={n} name={n} rows={rows.filter((r) => r.contractor === n)} today={today} />)}</ul>;
}

export function PaySubcontractor({ names, today }: { names: string[]; today: string }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [p, setP] = useState({ date: today, name: names[0] ?? "", gross: "", materials: "0", notes: "" });
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Who"><select value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} className={inputCls}>{names.map((n) => <option key={n}>{n}</option>)}</select></Field>
        <Field label="Date paid"><input type="date" value={p.date} onChange={(e) => setP({ ...p, date: e.target.value })} className={inputCls} /></Field>
        <Field label="Gross, before VAT (£)"><input inputMode="decimal" value={p.gross} onChange={(e) => setP({ ...p, gross: e.target.value })} className={inputCls} /></Field>
        <Field label="Materials he supplied (£)"><input inputMode="decimal" value={p.materials} onChange={(e) => setP({ ...p, materials: e.target.value })} className={inputCls} /></Field>
      </div>
      <Field label="Notes (optional)"><input value={p.notes} onChange={(e) => setP({ ...p, notes: e.target.value })} className={inputCls} placeholder="e.g. week ending 21/11, jobs 557 and 558" /></Field>
      <button
        type="button"
        disabled={pending || !p.gross}
        className={primaryBtn}
        onClick={() => run(async () => {
          const r = await cisPaySubcontractor({ ...p, gross: Number(p.gross.replace(/[£,]/g, "")), materials: Number(p.materials.replace(/[£,]/g, "")) || 0 });
          setMsg({ ok: r.ok, text: r.message });
          if (r.ok) { setP({ ...p, gross: "", materials: "0", notes: "" }); router.refresh(); }
        })}
      >
        Record the payment
      </button>
      <Note msg={msg} />
    </div>
  );
}
