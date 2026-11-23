"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { Field, inputCls, primaryBtn, secondaryBtn, textareaCls } from "@/components/ui";
import type { ShortQuote } from "@/lib/quote-short";
import { makeQuote } from "../actions";

const small = "h-11 w-full rounded-lg border border-line bg-bg px-3 text-[15px] outline-none placeholder:text-muted focus:border-blue";
const money = (n: number) => n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });

export function QuoteForm({ jobId, start: initial, note }: { jobId: string; start: ShortQuote; note: string }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [q, setQ] = useState<ShortQuote>(initial);
  const [excl, setExcl] = useState(initial.exclusions.join("\n"));
  const [assm, setAssm] = useState(initial.assumptions.join("\n"));
  const [msg, setMsg] = useState<{ ok: boolean; text: string; problems?: string[]; docUrl?: string; pdfUrl?: string } | null>(null);
  const set = (patch: Partial<ShortQuote>) => setQ((x) => ({ ...x, ...patch }));
  const setGroup = (gi: number, patch: Partial<ShortQuote["schedule"][number]>) => set({ schedule: q.schedule.map((g, i) => (i === gi ? { ...g, ...patch } : g)) });
  const setItem = (gi: number, ii: number, patch: Partial<ShortQuote["schedule"][number]["items"][number]>) =>
    setGroup(gi, { items: q.schedule[gi].items.map((it, i) => (i === ii ? { ...it, ...patch } : it)) });

  return (
    <div className="space-y-6">
      {note && <p className="rounded-xl bg-surface px-4 py-3 text-[15px]">{note}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job name on the cover">
          <input value={q.project} onChange={(e) => set({ project: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Site address and postcode">
          <input value={q.site} onChange={(e) => set({ site: e.target.value })} className={inputCls} />
        </Field>
      </div>
      <Field label="Project summary" hint="Two or three sentences: what the job is, where, and anything it follows on from.">
        <textarea value={q.summary} onChange={(e) => set({ summary: e.target.value })} className={textareaCls} />
      </Field>
      <Field label="The installation" hint="Cable types, containment, fittings and controls, how existing circuits are used, testing and certification.">
        <textarea value={q.installation} onChange={(e) => set({ installation: e.target.value })} className={textareaCls} />
      </Field>

      <div>
        <p className="mb-2 text-[15px] font-medium">Room-by-room schedule</p>
        <div className="space-y-3">
          {q.schedule.map((g, gi) => (
            <div key={gi} className="rounded-xl border border-line bg-bg p-3">
              <div className="flex gap-2">
                <input value={g.area} onChange={(e) => setGroup(gi, { area: e.target.value })} placeholder="Room or area" aria-label="Room or area" className={`${small} font-semibold uppercase`} />
                <button type="button" onClick={() => set({ schedule: q.schedule.filter((_, i) => i !== gi) })} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:text-bad" aria-label={`Remove ${g.area}`}>
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              {g.items.map((it, ii) => (
                <div key={ii} className="mt-2 grid gap-2 sm:grid-cols-[10rem_4.5rem_1fr_2.75rem]">
                  <input value={it.item} onChange={(e) => setItem(gi, ii, { item: e.target.value })} placeholder="Item" aria-label="Item" className={small} />
                  <input value={it.ref} onChange={(e) => setItem(gi, ii, { ref: e.target.value })} placeholder="Ref" aria-label="Ref" className={small} />
                  <input value={it.works} onChange={(e) => setItem(gi, ii, { works: e.target.value })} placeholder="Works" aria-label="Works" className={small} />
                  <button type="button" onClick={() => setGroup(gi, { items: g.items.filter((_, i) => i !== ii) })} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:text-bad" aria-label="Remove this line">
                    <Trash2 className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setGroup(gi, { items: [...g.items, { item: "", ref: "", works: "" }] })} className="mt-2 text-[14px] font-medium text-muted underline underline-offset-4">
                Add a line
              </button>
            </div>
          ))}
          <button type="button" onClick={() => set({ schedule: [...q.schedule, { area: "", items: [{ item: "", ref: "", works: "" }] }] })} className={secondaryBtn}>
            <Plus className="h-5 w-5" aria-hidden="true" /> Add an area
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[15px] font-medium">Investment summary</p>
        <p className="mb-2 text-[14px] text-muted">The amounts come from the pricing sheet and can&apos;t be changed here. Price it again to change them.</p>
        <div className="space-y-2">
          {q.investment.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[12rem_1fr_7rem]">
              <input value={l.section} onChange={(e) => set({ investment: q.investment.map((x, k) => (k === i ? { ...x, section: e.target.value } : x)) })} aria-label="Section" className={small} />
              <input value={l.description} onChange={(e) => set({ investment: q.investment.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)) })} aria-label="Description" className={small} />
              <p className="flex h-11 items-center justify-end px-1 tabular-nums">{money(l.amount)}</p>
            </div>
          ))}
          <dl className="ml-auto max-w-xs space-y-1 pt-2 text-[15px]">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{money(q.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">VAT @ 20%</dt><dd className="tabular-nums">{money(q.vat)}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Total (inc VAT)</dt><dd className="tabular-nums">{money(q.total)}</dd></div>
          </dl>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-3 text-[16px]">
          <input type="checkbox" checked={q.deposit} onChange={(e) => set({ deposit: e.target.checked })} className="h-5 w-5 accent-[var(--blue)]" />
          20% deposit on acceptance (untick for 100% on completion)
        </label>
        <Field label="Payment due within (days)">
          <input value={q.paymentDays} onChange={(e) => set({ paymentDays: Number(e.target.value) })} inputMode="numeric" className={inputCls} />
        </Field>
      </div>
      <Field label="Exclusions for this job" hint="One per line. The template's standard exclusions are always included.">
        <textarea value={excl} onChange={(e) => setExcl(e.target.value)} className={`${textareaCls} min-h-20`} />
      </Field>
      <Field label="Assumptions" hint="One per line.">
        <textarea value={assm} onChange={(e) => setAssm(e.target.value)} className={`${textareaCls} min-h-20`} />
      </Field>
      <p className="text-[15px] text-muted">
        Prepared by {q.preparedBy.name}, {q.preparedBy.title}. Dated {q.date}, valid until {q.validUntil}.
      </p>

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
          const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
          const full = { ...q, exclusions: lines(excl), assumptions: lines(assm) };
          setMsg(null);
          run(async () => {
            const r = await makeQuote(jobId, full);
            setMsg({ ok: r.ok, text: r.message, problems: r.problems, docUrl: r.docUrl, pdfUrl: r.pdfUrl });
            router.refresh();
          });
        }}
      >
        {pending ? "Making the quote in Google Docs…" : "Make the quote"}
      </button>
    </div>
  );
}
