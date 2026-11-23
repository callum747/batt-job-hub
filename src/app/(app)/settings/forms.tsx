"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, inputCls, secondaryBtn } from "@/components/ui";
import type { PersonRow } from "@/lib/data";
import { saveMargins, savePerson } from "../actions";
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
