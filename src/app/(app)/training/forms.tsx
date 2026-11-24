"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, inputCls, primaryBtn, secondaryBtn } from "@/components/ui";
import type { Qualification } from "@/lib/training";
import { certificateUpload, qualificationSave } from "../actions";

type Person = { id: string; short_name: string };

/** Add a qualification or card to someone, or change one. Leave "Runs out" blank if it doesn't expire. */
export function QualificationForm({ qual, people, names }: { qual: Qualification | null; people: Person[]; names: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const q = qual;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        start(async () => {
          const r = await qualificationSave(q?.id ?? null, f);
          setMsg({ ok: r.ok, text: r.message });
          if (r.ok) {
            if (!q) form.reset();
            router.refresh();
          }
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!q && (
          <Field label="Who">
            <select name="person_id" required defaultValue="" className={inputCls}>
              <option value="" disabled>Choose…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.short_name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Qualification or card">
          <input name="name" required defaultValue={q?.name ?? ""} list="qual-names" className={inputCls} placeholder="ECS Gold Card" />
          <datalist id="qual-names">
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>
        <Field label="Card or certificate number"><input name="number" defaultValue={q?.number ?? ""} className={inputCls} /></Field>
        <Field label="Date gained"><input type="date" name="issued" defaultValue={q?.issued ?? ""} className={inputCls} /></Field>
        <Field label="Runs out" hint="Leave blank if it doesn't expire."><input type="date" name="expires" defaultValue={q?.expires ?? ""} className={inputCls} /></Field>
        <Field label="Link to the certificate" hint="Paste the Drive link, if it's saved there."><input name="file_url" defaultValue={q?.file_url ?? ""} className={inputCls} placeholder="https://drive.google.com/…" /></Field>
      </div>
      <Field label="Notes"><input name="notes" defaultValue={q?.notes ?? ""} className={inputCls} /></Field>
      {q && (
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" name="gone" defaultChecked={!q.active} className="h-5 w-5" /> No longer held (takes it off the matrix; it&apos;s kept on record)
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={q ? secondaryBtn : primaryBtn}>{pending ? "Saving…" : q ? "Save" : "Add"}</button>
        {msg && <p role="status" className={`rounded-lg px-3 py-2 text-[14px] ${msg.ok ? "bg-blue-soft" : "border border-warn/30 bg-warn/10"}`}>{msg.text}</p>}
      </div>
    </form>
  );
}

/** Save a photo of the card or the certificate into the person's folder in Drive, linked to this qualification. */
export function CertificateForm({ qualId, has }: { qualId: string; has: boolean }) {
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
          const r = await certificateUpload(qualId, f);
          setMsg({ ok: r.ok, text: r.message });
          if (r.ok) {
            form.reset();
            router.refresh();
          }
        });
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input type="file" name="file" required accept="application/pdf,image/*" className="block text-[15px] file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-bg file:px-3 file:py-2" />
      <button type="submit" disabled={pending} className={secondaryBtn}>{pending ? "Saving…" : has ? "Replace the certificate" : "Save the certificate"}</button>
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-[14px] ${msg.ok ? "bg-blue-soft" : "border border-warn/30 bg-warn/10"}`}>{msg.text}</p>}
    </form>
  );
}
