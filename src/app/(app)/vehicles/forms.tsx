"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus } from "lucide-react";
import { Field, inputCls, primaryBtn, secondaryBtn, textareaCls } from "@/components/ui";
import type { Vehicle } from "@/lib/vehicles";
import { vehicleDocUpload, vehicleFolder, vehicleLogAdd, vehicleSave } from "../actions";

type Person = { id: string; short_name: string };

/** Add a vehicle, or change one. Dates left blank simply aren't tracked. */
export function VehicleForm({ vehicle, people }: { vehicle: Vehicle | null; people: Person[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const v = vehicle;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        start(async () => {
          const r = await vehicleSave(v?.id ?? null, f);
          setMsg({ ok: r.ok, text: r.message });
          if (r.ok) {
            if (!v) form.reset();
            router.refresh();
          }
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="What you call it"><input name="name" required defaultValue={v?.name ?? ""} className={inputCls} placeholder="Callum's Transporter" /></Field>
        <Field label="Registration"><input name="registration" defaultValue={v?.registration ?? ""} className={`${inputCls} uppercase`} placeholder="AB12 CDE" /></Field>
        <Field label="Make and model"><input name="make_model" defaultValue={v?.make_model ?? ""} className={inputCls} placeholder="VW Transporter T6.1" /></Field>
        <Field label="Who drives it">
          <select name="driver_id" defaultValue={v?.driver_id ?? ""} className={inputCls}>
            <option value="">Nobody set</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.short_name}</option>
            ))}
          </select>
        </Field>
        <Field label="MOT due"><input type="date" name="mot_due" defaultValue={v?.mot_due ?? ""} className={inputCls} /></Field>
        <Field label="Road tax due"><input type="date" name="tax_due" defaultValue={v?.tax_due ?? ""} className={inputCls} /></Field>
        <Field label="Insurance renewal"><input type="date" name="insurance_due" defaultValue={v?.insurance_due ?? ""} className={inputCls} /></Field>
        <Field label="Next service"><input type="date" name="service_due" defaultValue={v?.service_due ?? ""} className={inputCls} /></Field>
        <Field label="Miles per gallon (real)"><input name="mpg" inputMode="decimal" defaultValue={v?.mpg ?? ""} className={inputCls} placeholder="35" /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Finance or lease" hint="Who it's with, the monthly payment and when it ends."><textarea name="finance" defaultValue={v?.finance ?? ""} className={textareaCls} /></Field>
        <Field label="Notes"><textarea name="notes" defaultValue={v?.notes ?? ""} className={textareaCls} /></Field>
      </div>
      {v && (
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" name="gone" defaultChecked={!v.active} className="h-5 w-5" /> We no longer have this vehicle
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={v ? secondaryBtn : primaryBtn}>{pending ? "Saving…" : v ? "Save" : "Add vehicle"}</button>
        {msg && <p role="status" className={`rounded-lg px-3 py-2 text-[14px] ${msg.ok ? "bg-blue-soft" : "border border-warn/30 bg-warn/10"}`}>{msg.text}</p>}
      </div>
    </form>
  );
}

export function VehicleFolderButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={secondaryBtn}
        onClick={() =>
          start(async () => {
            const r = await vehicleFolder(id);
            setMsg(r.message);
            if (r.ok) router.refresh();
          })
        }
      >
        <FolderPlus className="h-5 w-5 text-blue" aria-hidden="true" /> {pending ? "Working…" : "Make its Drive folder"}
      </button>
      {msg && <span className="text-[14px] text-muted">{msg}</span>}
    </span>
  );
}

const KINDS = ["MOT", "Service", "Insurance", "Road tax", "Repair", "Tyres", "Other"] as const;
const NEXT: Record<string, string> = { MOT: "Next MOT due", Service: "Next service due", Insurance: "Insurance runs to", "Road tax": "Road tax runs to" };

/** Log an MOT, a service, an insurance renewal or anything else done to the van, with its paperwork. */
export function VehicleLogForm({ vehicleId, today }: { vehicleId: string; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<string>("MOT");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        start(async () => {
          const r = await vehicleLogAdd(vehicleId, f);
          setMsg({ ok: r.ok, text: r.message });
          if (r.ok) {
            form.reset();
            setKind("MOT");
            router.refresh();
          }
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="What was it">
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <Field label="Date done"><input type="date" name="date" required defaultValue={today} className={inputCls} /></Field>
        {NEXT[kind] && <Field label={NEXT[kind]} hint="Moves the reminder on to this date."><input type="date" name="next_due" className={inputCls} /></Field>}
        <Field label="Mileage"><input name="mileage" inputMode="numeric" className={inputCls} placeholder="84210" /></Field>
        <Field label="Cost (£ ex VAT)"><input name="cost" inputMode="decimal" className={inputCls} /></Field>
        <Field label="Certificate, invoice or policy" hint="A PDF or photo. It's saved in the van's Drive folder."><input type="file" name="file" accept="application/pdf,image/*" className="block w-full text-[15px] file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-bg file:px-3 file:py-2" /></Field>
      </div>
      <Field label="Notes"><input name="notes" className={inputCls} placeholder="Passed, two advisories on rear tyres" /></Field>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryBtn}>{pending ? "Saving…" : "Add to the log"}</button>
        {msg && <p role="status" className={`rounded-lg px-3 py-2 text-[14px] ${msg.ok ? "bg-blue-soft" : "border border-warn/30 bg-warn/10"}`}>{msg.text}</p>}
      </div>
    </form>
  );
}

/** Any other document for the van: the V5, the finance agreement, a breakdown policy. */
export function VehicleDocForm({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        start(async () => {
          const r = await vehicleDocUpload(vehicleId, f);
          setMsg({ ok: r.ok, text: r.message });
          if (r.ok) {
            form.reset();
            router.refresh();
          }
        });
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input type="file" name="file" required className="block text-[15px] file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-bg file:px-3 file:py-2" />
      <button type="submit" disabled={pending} className={secondaryBtn}>{pending ? "Saving…" : "Save to its folder"}</button>
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-[14px] ${msg.ok ? "bg-blue-soft" : "border border-warn/30 bg-warn/10"}`}>{msg.text}</p>}
    </form>
  );
}
