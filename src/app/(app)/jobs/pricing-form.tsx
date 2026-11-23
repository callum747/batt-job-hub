"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { Field, inputCls, primaryBtn, secondaryBtn } from "@/components/ui";
import type { PricingInput, Product } from "@/lib/pricing";
import { refreshPriceList, runPricing } from "../actions";

type Row = { id: number; area: string; pick: string; custom: boolean; description: string; qty: string; materialEach: string; hoursEach: string };

let seq = 1;
const blank = (): Row => ({ id: seq++, area: "", pick: "", custom: false, description: "", qty: "1", materialEach: "", hoursEach: "" });

function rowsFrom(input: PricingInput | null, products: Product[]): Row[] {
  if (!input?.items.length) return [blank()];
  const labelOf = new Map(products.map((p) => [p.key, p.label]));
  return input.items.map((it) => ({
    id: seq++,
    area: it.area,
    pick: it.key ? labelOf.get(it.key) ?? "" : "",
    custom: it.key === null,
    description: it.key === null ? it.description : "",
    qty: String(it.qty),
    materialEach: it.materialEach !== undefined ? String(it.materialEach) : "",
    hoursEach: it.hoursEach !== undefined ? String(it.hoursEach) : "",
  }));
}

const small = "h-11 w-full rounded-lg border border-line bg-bg px-3 text-[15px] outline-none placeholder:text-muted focus:border-blue";

export function PricingForm({
  jobId,
  products,
  listDate,
  saved,
  miles,
}: {
  jobId: string;
  products: Product[];
  listDate: string;
  saved: PricingInput | null;
  miles: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(saved, products));
  const [f, setF] = useState({
    miles: saved ? String(saved.miles) : miles !== null ? String(miles) : "",
    people: String(saved?.people ?? 2),
    vans: String(saved?.vans ?? 1),
    parking: saved?.parking ? String(saved.parking) : "",
    waste: saved?.waste ? String(saved.waste) : "",
    access: saved?.access ? String(saved.access) : "",
    other: saved?.other ? String(saved.other) : "",
    oneElectrician: saved?.oneElectrician ?? false,
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string; problems?: string[] } | null>(null);
  const byLabel = useMemo(() => new Map(products.map((p) => [p.label, p])), [products]);
  const set = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function submit() {
    const problems: string[] = [];
    const items = rows
      .filter((r) => r.pick.trim() || r.description.trim() || r.custom)
      .map((r, i) => {
        const qty = Number(r.qty);
        if (r.custom) {
          return { area: r.area, key: null, description: r.description, qty, materialEach: r.materialEach === "" ? NaN : Number(r.materialEach), hoursEach: r.hoursEach === "" ? NaN : Number(r.hoursEach) };
        }
        const p = byLabel.get(r.pick.trim());
        if (!p) problems.push(`Line ${i + 1}: "${r.pick}" isn't on the price list. Pick it from the list, or tick "Not on the price list".`);
        return { area: r.area, key: p?.key ?? "", description: p ? p.label.split(" | ")[0] : r.pick, qty };
      });
    if (problems.length) return setMsg({ ok: false, text: "A few things need fixing before this can be priced.", problems });
    const input: PricingInput = {
      items,
      miles: f.miles.trim() === "" ? NaN : Number(f.miles),
      people: Number(f.people),
      vans: Number(f.vans),
      parking: Number(f.parking) || 0,
      waste: Number(f.waste) || 0,
      access: Number(f.access) || 0,
      other: Number(f.other) || 0,
      oneElectrician: f.oneElectrician,
    };
    setMsg(null);
    start(async () => {
      const r = await runPricing(jobId, input);
      setMsg({ ok: r.ok, text: r.message, problems: r.problems });
      if (r.ok && r.number) router.replace(`/jobs/${r.number}?tab=money`, { scroll: false });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <datalist id="price-list">
        {products.map((p) => (
          <option key={p.key} value={p.label}>
            {p.section}
          </option>
        ))}
      </datalist>

      <div className="space-y-3">
        {rows.map((r, i) => {
          const p = byLabel.get(r.pick.trim());
          return (
            <div key={r.id} className="rounded-xl border border-line bg-bg p-3">
              <div className="grid gap-2 sm:grid-cols-[9rem_1fr_5rem_2.75rem]">
                <label>
                  <span className="sr-only">Area for line {i + 1}</span>
                  <input value={r.area} onChange={(e) => set(r.id, { area: e.target.value })} placeholder="Area, e.g. Kitchen" className={small} />
                </label>
                {r.custom ? (
                  <label>
                    <span className="sr-only">Item {i + 1}</span>
                    <input value={r.description} onChange={(e) => set(r.id, { description: e.target.value })} placeholder="What is it?" className={small} />
                  </label>
                ) : (
                  <label>
                    <span className="sr-only">Item {i + 1}</span>
                    <input list="price-list" value={r.pick} onChange={(e) => set(r.id, { pick: e.target.value })} placeholder="Start typing: double socket, downlight…" className={small} />
                  </label>
                )}
                <label>
                  <span className="sr-only">Quantity for line {i + 1}</span>
                  <input value={r.qty} onChange={(e) => set(r.id, { qty: e.target.value })} inputMode="decimal" placeholder="Qty" className={small} />
                </label>
                <button type="button" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : [blank()]))} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-bad" aria-label={`Remove line ${i + 1}`}>
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              {r.custom && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-[14px] text-muted">
                    Material cost each, ex VAT (£)
                    <input value={r.materialEach} onChange={(e) => set(r.id, { materialEach: e.target.value })} inputMode="decimal" className={`${small} mt-1`} />
                  </label>
                  <label className="text-[14px] text-muted">
                    Labour hours each
                    <input value={r.hoursEach} onChange={(e) => set(r.id, { hoursEach: e.target.value })} inputMode="decimal" className={`${small} mt-1`} />
                  </label>
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[14px] text-muted">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={r.custom} onChange={(e) => set(r.id, { custom: e.target.checked })} className="h-4 w-4 accent-[var(--blue)]" /> Not on the price list
                </label>
                {!r.custom && p && (
                  <span>
                    {p.section} · £{p.materials.toFixed(2)} materials and {p.hours} hours each on the list
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <button type="button" onClick={() => setRows((rs) => [...rs, { ...blank(), area: rs[rs.length - 1]?.area ?? "" }])} className={secondaryBtn}>
          <Plus className="h-5 w-5" aria-hidden="true" /> Add a line
        </button>
      </div>

      <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-3">
        <Field label="Round-trip miles" hint="Exact road miles from 18 Alwin Close and back">
          <input value={f.miles} onChange={(e) => setF({ ...f, miles: e.target.value })} inputMode="decimal" className={inputCls} />
        </Field>
        <Field label="People on site">
          <input value={f.people} onChange={(e) => setF({ ...f, people: e.target.value })} inputMode="numeric" className={inputCls} />
        </Field>
        <Field label="Vans">
          <input value={f.vans} onChange={(e) => setF({ ...f, vans: e.target.value })} inputMode="numeric" className={inputCls} />
        </Field>
        <Field label="Parking and congestion (£)">
          <input value={f.parking} onChange={(e) => setF({ ...f, parking: e.target.value })} inputMode="decimal" placeholder="0" className={inputCls} />
        </Field>
        <Field label="Waste disposal (£)">
          <input value={f.waste} onChange={(e) => setF({ ...f, waste: e.target.value })} inputMode="decimal" placeholder="0" className={inputCls} />
        </Field>
        <Field label="Access hire (£)">
          <input value={f.access} onChange={(e) => setF({ ...f, access: e.target.value })} inputMode="decimal" placeholder="0" className={inputCls} />
        </Field>
        <Field label="Other site costs (£)">
          <input value={f.other} onChange={(e) => setF({ ...f, other: e.target.value })} inputMode="decimal" placeholder="0" className={inputCls} />
        </Field>
        <label className="flex items-center gap-3 self-end pb-3 text-[16px] sm:col-span-2">
          <input type="checkbox" checked={f.oneElectrician} onChange={(e) => setF({ ...f, oneElectrician: e.target.checked })} className="h-5 w-5 accent-[var(--blue)]" />
          One electrician, no apprentice
        </label>
      </div>

      {msg && (
        <div role={msg.ok ? "status" : "alert"} className={`rounded-xl px-4 py-3 text-[15px] ${msg.ok ? "bg-blue-soft font-medium" : "border border-bad/30 bg-bad/10"}`}>
          <p>{msg.text}</p>
          {msg.problems && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {msg.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={submit} disabled={pending} className={primaryBtn}>
          {pending ? "Pricing in the spreadsheet…" : saved ? "Price it again" : "Price it"}
        </button>
        <button
          type="button"
          disabled={pending}
          className="text-[14px] text-muted underline underline-offset-4"
          onClick={() => start(async () => { const r = await refreshPriceList(); setMsg({ ok: r.ok, text: r.message }); router.refresh(); })}
        >
          Refresh the price list ({products.length} products, read {listDate})
        </button>
      </div>
      <p className="text-[14px] text-muted">
        Each pricing makes a fresh copy of the pricing spreadsheet in the job&apos;s 01 - Quote &amp; Contract folder. The spreadsheet does the sums; nothing is priced by the app itself.
      </p>
    </div>
  );
}

export function SheetLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[15px] font-medium underline underline-offset-4">
      Open the pricing sheet <ExternalLink className="h-4 w-4" aria-hidden="true" />
    </a>
  );
}
