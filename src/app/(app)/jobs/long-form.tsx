"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { Field, inputCls, primaryBtn, secondaryBtn, textareaCls } from "@/components/ui";
import { POINT_COLUMNS, type LongQuote, type PointColumn } from "@/lib/quote-long";
import { makeLongQuote } from "../actions";

const small = "h-11 w-full rounded-lg border border-line bg-bg px-3 text-[15px] outline-none placeholder:text-muted focus:border-blue";
const tiny = "h-10 w-full rounded-lg border border-line bg-bg px-1 text-center text-[14px] outline-none focus:border-blue";
const money = (n: number) => n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

function Remove({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:text-bad" aria-label={label}>
      <Trash2 className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

export function LongForm({ jobId, start }: { jobId: string; start: LongQuote }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [q, setQ] = useState<LongQuote>(start);
  const [excl, setExcl] = useState(start.exclusions.join("\n"));
  const [assm, setAssm] = useState(start.assumptions.join("\n"));
  const [rates, setRates] = useState({ socket: start.rates.socket?.toString() ?? "", downlight: start.rates.downlight?.toString() ?? "", data: start.rates.data?.toString() ?? "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string; problems?: string[]; docUrl?: string; pdfUrl?: string } | null>(null);
  const set = (patch: Partial<LongQuote>) => setQ((x) => ({ ...x, ...patch }));
  const upd = <K extends "scope" | "sections" | "extras" | "programme" | "rooms" | "fittings">(k: K, i: number, patch: Partial<LongQuote[K][number]>) =>
    set({ [k]: (q[k] as LongQuote[K][number][]).map((x, n) => (n === i ? { ...x, ...patch } : x)) } as Partial<LongQuote>);
  const drop = <K extends "scope" | "extras" | "programme" | "rooms" | "fittings">(k: K, i: number) => set({ [k]: (q[k] as unknown[]).filter((_, n) => n !== i) } as Partial<LongQuote>);

  return (
    <div className="space-y-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job name on the cover"><input value={q.project} onChange={(e) => set({ project: e.target.value })} className={inputCls} /></Field>
        <Field label="Site address and postcode"><input value={q.site} onChange={(e) => set({ site: e.target.value })} className={inputCls} /></Field>
      </div>
      <Field label="Project summary" hint="Two or three sentences: the site and what the client needs.">
        <textarea value={q.summary} onChange={(e) => set({ summary: e.target.value })} className={textareaCls} />
      </Field>
      <Field label="Scope of works" hint="Cable types, containment, data, distribution, finish, testing and certification.">
        <textarea value={q.installation} onChange={(e) => set({ installation: e.target.value })} className={textareaCls} />
      </Field>

      <section>
        <p className="mb-2 text-[15px] font-medium">Scope summary (total quantities)</p>
        <div className="space-y-2">
          {q.scope.map((s, i) => (
            <div key={i} className="flex gap-2">
              <input value={s.item} onChange={(e) => upd("scope", i, { item: e.target.value })} aria-label="Item" className={small} />
              <input value={s.qty} onChange={(e) => upd("scope", i, { qty: e.target.value })} aria-label="Quantity" className={`${small} w-24 shrink-0`} />
              <Remove onClick={() => drop("scope", i)} label="Remove this line" />
            </div>
          ))}
          <button type="button" onClick={() => set({ scope: [...q.scope, { item: "", qty: "" }] })} className="text-[14px] font-medium text-muted underline underline-offset-4">Add a line</button>
        </div>
      </section>

      <section>
        <p className="mb-2 text-[15px] font-medium">Investment summary</p>
        <p className="mb-2 text-[14px] text-muted">The amounts come from the pricing sheet. Price it again to change them.</p>
        <div className="space-y-2">
          {q.sections.map((s, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[12rem_1fr_7rem]">
              <input value={s.section} onChange={(e) => upd("sections", i, { section: e.target.value })} aria-label="Section" className={small} />
              <input value={s.description} onChange={(e) => upd("sections", i, { description: e.target.value })} aria-label="Description" className={small} />
              <p className="flex h-11 items-center justify-end tabular-nums">{money(s.amount)}</p>
            </div>
          ))}
          {q.prelims > 0 && <p className="flex justify-between text-[15px]"><span className="text-muted">Preliminaries (travel and site costs)</span><span className="tabular-nums">{money(q.prelims)}</span></p>}
          <p className="flex justify-between pt-1 font-semibold"><span>Total inc VAT</span><span className="tabular-nums">{money(q.total)}</span></p>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Payment days"><input value={q.paymentDays} onChange={(e) => set({ paymentDays: Number(e.target.value) })} inputMode="numeric" className={inputCls} /></Field>
        <Field label="Extra double socket (£)" hint="Empty removes the line"><input value={rates.socket} onChange={(e) => setRates({ ...rates, socket: e.target.value })} inputMode="decimal" className={inputCls} /></Field>
        <Field label="Extra downlight (£)" hint="Empty removes the line"><input value={rates.downlight} onChange={(e) => setRates({ ...rates, downlight: e.target.value })} inputMode="decimal" className={inputCls} /></Field>
        <Field label="Extra data point (£)" hint="Empty removes the line"><input value={rates.data} onChange={(e) => setRates({ ...rates, data: e.target.value })} inputMode="decimal" className={inputCls} /></Field>
      </div>

      <section>
        <p className="mb-2 text-[15px] font-medium">Optional extras</p>
        <div className="space-y-2">
          {q.extras.map((x, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[12rem_1fr_7rem_2.75rem]">
              <input value={x.item} onChange={(e) => upd("extras", i, { item: e.target.value })} placeholder="Item" aria-label="Item" className={small} />
              <input value={x.description} onChange={(e) => upd("extras", i, { description: e.target.value })} placeholder="Description" aria-label="Description" className={small} />
              <input value={x.price || ""} onChange={(e) => upd("extras", i, { price: Number(e.target.value) })} placeholder="£ ex VAT" aria-label="Price" inputMode="decimal" className={small} />
              <Remove onClick={() => drop("extras", i)} label="Remove this extra" />
            </div>
          ))}
          <button type="button" onClick={() => set({ extras: [...q.extras, { item: "", description: "", price: 0 }] })} className="text-[14px] font-medium text-muted underline underline-offset-4">Add an optional extra</button>
        </div>
      </section>

      <section>
        <p className="mb-2 text-[15px] font-medium">Project programme</p>
        <div className="space-y-2">
          {q.programme.map((p, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[2rem_12rem_1fr_2.75rem]">
              <span className="flex h-11 items-center font-semibold">{i + 1}</span>
              <input value={p.area} onChange={(e) => upd("programme", i, { area: e.target.value })} aria-label="Area" className={small} />
              <input value={p.works} onChange={(e) => upd("programme", i, { works: e.target.value })} aria-label="Works" className={small} />
              <Remove onClick={() => drop("programme", i)} label="Remove this phase" />
            </div>
          ))}
          <button type="button" onClick={() => set({ programme: [...q.programme, { area: "", works: "" }] })} className="text-[14px] font-medium text-muted underline underline-offset-4">Add a phase</button>
        </div>
      </section>

      <Field label="Exclusions for this job" hint="One per line. The standard exclusions are always included.">
        <textarea value={excl} onChange={(e) => setExcl(e.target.value)} className={`${textareaCls} min-h-20`} />
      </Field>
      <Field label="Assumptions" hint="One per line.">
        <textarea value={assm} onChange={(e) => setAssm(e.target.value)} className={`${textareaCls} min-h-20`} />
      </Field>

      <section>
        <p className="mb-1 text-[15px] font-medium">Appendix: point schedule</p>
        <p className="mb-2 text-[14px] text-muted">Counted from the pricing. Remove every room to leave the appendix out.</p>
        <div className="overflow-x-auto">
          <table className="min-w-[44rem] text-[14px]">
            <thead>
              <tr className="text-muted">
                <th className="w-40 px-1 py-1 text-left font-medium">Room</th>
                {POINT_COLUMNS.map((c) => <th key={c} className="w-12 px-1 py-1 font-medium">{c}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {q.rooms.map((r, i) => (
                <tr key={i}>
                  <td className="px-1 py-1"><input value={r.room} onChange={(e) => upd("rooms", i, { room: e.target.value })} aria-label="Room" className={small} /></td>
                  {POINT_COLUMNS.map((c: PointColumn) => (
                    <td key={c} className="px-1 py-1">
                      <input value={r.points[c] ?? ""} onChange={(e) => upd("rooms", i, { points: { ...r.points, [c]: Number(e.target.value) || 0 } })} inputMode="numeric" aria-label={`${r.room} ${c}`} className={tiny} />
                    </td>
                  ))}
                  <td><Remove onClick={() => drop("rooms", i)} label={`Remove ${r.room}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => set({ rooms: [...q.rooms, { room: "", points: {} }] })} className="mt-2 text-[14px] font-medium text-muted underline underline-offset-4">Add a room</button>
      </section>

      {q.rooms.length > 0 && (
        <section>
          <p className="mb-2 text-[15px] font-medium">Lighting fitting key</p>
          <div className="space-y-2">
            {q.fittings.map((x, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[5rem_1fr_1fr_2.75rem]">
                <input value={x.ref} onChange={(e) => upd("fittings", i, { ref: e.target.value })} aria-label="Ref" className={small} />
                <input value={x.fitting} onChange={(e) => upd("fittings", i, { fitting: e.target.value })} placeholder="Manufacturer, model, wattage" aria-label="Fitting" className={small} />
                <input value={x.notes} onChange={(e) => upd("fittings", i, { notes: e.target.value })} placeholder="Colour temperature, finish" aria-label="Notes" className={small} />
                <Remove onClick={() => drop("fittings", i)} label="Remove this fitting" />
              </div>
            ))}
            <button type="button" onClick={() => set({ fittings: [...q.fittings, { ref: "", fitting: "", notes: "" }] })} className={secondaryBtn}>
              <Plus className="h-5 w-5" aria-hidden="true" /> Add a fitting
            </button>
          </div>
        </section>
      )}

      {msg && (
        <div role={msg.ok ? "status" : "alert"} className={`rounded-xl px-4 py-3 text-[15px] ${msg.ok ? "bg-blue-soft" : "border border-bad/30 bg-bad/10"}`}>
          <p className="font-medium">{msg.text}</p>
          {msg.problems && <ul className="mt-2 list-disc space-y-1 pl-5">{msg.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <div className="mt-2 flex flex-wrap gap-4">
            {msg.pdfUrl && <a href={msg.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold underline underline-offset-4">Open the PDF <ExternalLink className="h-4 w-4" aria-hidden="true" /></a>}
            {msg.docUrl && <a href={msg.docUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">Open the Google Doc <ExternalLink className="h-4 w-4" aria-hidden="true" /></a>}
          </div>
        </div>
      )}
      <button
        type="button"
        disabled={pending}
        className={primaryBtn}
        onClick={() => {
          const r = (v: string) => (v.trim() === "" ? null : Number(v));
          const full: LongQuote = { ...q, exclusions: lines(excl), assumptions: lines(assm), rates: { socket: r(rates.socket), downlight: r(rates.downlight), data: r(rates.data) } };
          setMsg(null);
          run(async () => {
            const res = await makeLongQuote(jobId, full);
            setMsg({ ok: res.ok, text: res.message, problems: res.problems, docUrl: res.docUrl, pdfUrl: res.pdfUrl });
            router.refresh();
          });
        }}
      >
        {pending ? "Making the long-form quote…" : "Make the long-form quote"}
      </button>
      <p className="text-[14px] text-muted">Prepared by {q.preparedBy.name}, {q.preparedBy.title}. Dated {q.date}, valid until {q.validUntil}. Payment stages 25% / 35% / 30% / 10%, as the template has them.</p>
    </div>
  );
}
