"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { Field, inputCls, primaryBtn, secondaryBtn, textareaCls } from "@/components/ui";
import { priceSurvey } from "@/lib/survey";
import type { SurveyForm as Form } from "@/lib/google/survey-run";
import { makeSurvey } from "../actions";

const small = "h-11 w-full rounded-lg border border-line bg-bg px-3 text-[15px] outline-none placeholder:text-muted focus:border-blue";
const money = (n: number) => n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });

export function SurveyForm({ jobId, start, dayRate, perMile }: { jobId: string; start: Form; dayRate: number; perMile: number }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [f, setF] = useState<Form>(start);
  const [milesText, setMilesText] = useState(Number.isFinite(start.miles) ? String(start.miles) : "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; problems?: string[]; docUrl?: string; pdfUrl?: string } | null>(null);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const setSite = (i: number, patch: Partial<Form["sites"][number]>) => set({ sites: f.sites.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const setUnit = (si: number, ui: number, patch: Partial<Form["sites"][number]["units"][number]>) =>
    setSite(si, { units: f.sites[si].units.map((u, k) => (k === ui ? { ...u, ...patch } : u)) });
  const miles = milesText.trim() === "" ? NaN : Number(milesText);
  const preview = f.days > 0 && Number.isFinite(miles) && miles >= 0 ? priceSurvey({ days: f.days, dayRate, miles, perMile, route: f.route, weekend: f.weekend }) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Site name on the cover">
          <input value={f.siteName} onChange={(e) => set({ siteName: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Site address on the cover">
          <input value={f.siteAddress} onChange={(e) => set({ siteAddress: e.target.value })} className={inputCls} />
        </Field>
      </div>
      <Field label="Survey summary" hint="Two sentences: who has asked us to survey, which site, what is being surveyed, and how many days.">
        <textarea value={f.summary} onChange={(e) => set({ summary: e.target.value })} className={textareaCls} />
      </Field>

      <div>
        <p className="mb-2 text-[15px] font-medium">Survey schedule</p>
        <div className="space-y-3">
          {f.sites.map((s, si) => (
            <div key={si} className="rounded-xl border border-line bg-bg p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_8rem_2.75rem]">
                <input value={s.name} onChange={(e) => setSite(si, { name: e.target.value })} placeholder="Site name" aria-label="Site name" className={`${small} font-semibold`} />
                <input value={s.address} onChange={(e) => setSite(si, { address: e.target.value })} placeholder="Address" aria-label="Site address" className={small} />
                <input value={s.postcode} onChange={(e) => setSite(si, { postcode: e.target.value })} placeholder="Postcode" aria-label="Postcode" className={`${small} uppercase`} />
                <button type="button" onClick={() => set({ sites: f.sites.filter((_, k) => k !== si) })} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:text-bad" aria-label="Remove this site">
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              {s.units.map((u, ui) => (
                <div key={ui} className="mt-2 grid gap-2 sm:grid-cols-[1fr_7rem_1fr_2.75rem]">
                  <input value={u.name} onChange={(e) => setUnit(si, ui, { name: e.target.value })} placeholder="Unit 1 – Tenant" aria-label="Unit" className={small} />
                  <input value={u.area} onChange={(e) => setUnit(si, ui, { area: e.target.value })} placeholder="sq ft or tbc" aria-label="Area in square feet" className={small} />
                  <input value={u.scope} onChange={(e) => setUnit(si, ui, { scope: e.target.value })} placeholder="Electric, gas and water" aria-label="What is surveyed" className={small} />
                  <button type="button" onClick={() => setSite(si, { units: s.units.filter((_, k) => k !== ui) })} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:text-bad" aria-label="Remove this unit">
                    <Trash2 className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setSite(si, { units: [...s.units, { name: "", area: "", scope: s.units[s.units.length - 1]?.scope ?? "" }] })} className="mt-2 text-[14px] font-medium text-muted underline underline-offset-4">
                Add a unit
              </button>
            </div>
          ))}
          <button type="button" onClick={() => set({ sites: [...f.sites, { name: "", address: "", postcode: "", units: [{ name: "", area: "", scope: "" }] }] })} className={secondaryBtn}>
            <Plus className="h-5 w-5" aria-hidden="true" /> Add a site
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Survey days">
          <input value={f.days} onChange={(e) => set({ days: Number(e.target.value) })} inputMode="decimal" className={inputCls} />
        </Field>
        <Field label="Round-trip miles" hint="Exact road miles from 18 Alwin Close and back, all legs">
          <input value={milesText} onChange={(e) => setMilesText(e.target.value)} inputMode="decimal" className={inputCls} />
        </Field>
        <Field label="Payment due within (days)">
          <input value={f.paymentDays} onChange={(e) => set({ paymentDays: Number(e.target.value) })} inputMode="numeric" className={inputCls} />
        </Field>
      </div>
      <Field label="Route, when one trip covers several sites" hint="For example: Aylesbury to Stanmore and Stevenage and back. Leave empty for one site.">
        <input value={f.route} onChange={(e) => set({ route: e.target.value })} className={inputCls} />
      </Field>
      <label className="flex items-center gap-3 text-[16px]">
        <input type="checkbox" checked={f.weekend} onChange={(e) => set({ weekend: e.target.checked })} className="h-5 w-5 accent-[var(--blue)]" /> Weekend survey (1.5 times the day rate)
      </label>

      {preview && (
        <div className="rounded-xl bg-surface p-4 text-[15px]">
          {preview.lines.map((l) => (
            <p key={l.section} className="flex justify-between gap-4">
              <span>{l.description}</span>
              <span className="tabular-nums">{money(l.amount)}</span>
            </p>
          ))}
          <p className="mt-2 flex justify-between font-semibold">
            <span>Total inc VAT</span>
            <span className="tabular-nums">{money(preview.total)}</span>
          </p>
        </div>
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
          setMsg(null);
          run(async () => {
            const r = await makeSurvey(jobId, { ...f, miles });
            setMsg({ ok: r.ok, text: r.message, problems: r.problems, docUrl: r.docUrl, pdfUrl: r.pdfUrl });
            router.refresh();
          });
        }}
      >
        {pending ? "Making the survey proposal…" : "Price it and make the survey proposal"}
      </button>
      <p className="text-[14px] text-muted">
        Priced at {money(dayRate)} a survey day and {Math.round(perMile * 100)}p a mile, from Settings. Prepared by {f.preparedBy.name}, dated {f.date}, valid until {f.validUntil}.
      </p>
    </div>
  );
}
