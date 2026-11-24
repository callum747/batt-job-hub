"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, inputCls, secondaryBtn } from "@/components/ui";
import type { PersonRow } from "@/lib/data";
import { saveFuel, saveMargins, savePerson } from "../actions";
import { fuelPerMile } from "@/lib/money";
import { Toast } from "../jobs/job-controls";

export function PersonForm({ person }: { person: PersonRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="rounded-xl border border-line bg-bg p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await savePerson(person.id, f);
          setMsg(r.message);
          router.refresh();
        });
      }}
    >
      <p className="mb-3 flex items-center gap-2 text-[17px] font-semibold">
        <span className="inline-block h-4 w-4 rounded-full" style={{ backgroundColor: person.colour }} />
        {person.short_name}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><input name="full_name" defaultValue={person.full_name} className={inputCls} /></Field>
        <Field label="Role"><input name="role" defaultValue={person.role} className={inputCls} /></Field>
        <Field label="Email" hint="Used to invite them to visits in Google Calendar"><input name="email" type="email" defaultValue={person.email} className={inputCls} /></Field>
        <Field label="Day cost (£)"><input name="day_cost" inputMode="decimal" defaultValue={person.day_cost} className={inputCls} /></Field>
        <Field label="Colour"><input name="colour" type="color" defaultValue={person.colour} className="h-12 w-24 rounded-xl border border-line bg-bg p-1" /></Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={secondaryBtn}>Save {person.short_name}</button>
        <Toast message={msg} />
      </div>
    </form>
  );
}

export function FuelForm({ mpg, pencePerLitre, quoted }: { mpg: number | null; pencePerLitre: number | null; quoted: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState({ mpg: mpg ? String(mpg) : "", ppl: pencePerLitre ? String(pencePerLitre) : "" });
  const live = fuelPerMile(Number(f.mpg), Number(f.ppl));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(async () => {
          const r = await saveFuel(data);
          setMsg(r.message);
          router.refresh();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vans' miles per gallon (real, not the brochure)"><input name="mpg" inputMode="decimal" value={f.mpg} onChange={(e) => setF({ ...f, mpg: e.target.value })} className={inputCls} placeholder="e.g. 35" /></Field>
        <Field label="Fuel price (pence a litre)"><input name="pencePerLitre" inputMode="decimal" value={f.ppl} onChange={(e) => setF({ ...f, ppl: e.target.value })} className={inputCls} placeholder="e.g. 145" /></Field>
      </div>
      <p className="mt-3 text-[15px]">
        {live !== null ? (
          <>That&apos;s <b>{(live * 100).toFixed(1)}p a mile</b> in fuel.</>
        ) : (
          <span className="text-muted">Until both are filled in, job profit uses the quoted {Math.round(quoted * 100)}p a mile, which overstates fuel.</span>
        )}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={secondaryBtn}>Save</button>
        <Toast message={msg} />
      </div>
    </form>
  );
}

export function MarginsForm({ green, red }: { green: number; red: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await saveMargins(f);
          setMsg(r.message);
          router.refresh();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Green at or above (%)"><input name="green" inputMode="decimal" defaultValue={green} className={inputCls} /></Field>
        <Field label="Red below (%)"><input name="red" inputMode="decimal" defaultValue={red} className={inputCls} /></Field>
      </div>
      <p className="mt-3 text-[15px] text-muted">Amber in between.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={secondaryBtn}>Save</button>
        <Toast message={msg} />
      </div>
    </form>
  );
}
