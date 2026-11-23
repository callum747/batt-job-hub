"use client";

import { useState, useTransition } from "react";
import { JOB_TYPES } from "@/lib/jobs-rules";
import { useRouter } from "next/navigation";
import type { ClientRow, JobRow, PersonRow } from "@/lib/data";
import { Field, inputCls, primaryBtn } from "@/components/ui";
import { createJob, updateJob } from "../actions";
import { ClientPicker, TextArea, Toast } from "./job-controls";


type Props = {
  clients: Pick<ClientRow, "id" | "name">[];
  people?: PersonRow[];
  job?: JobRow;
};

/** New job form, and the job's Details tab. */
export function JobForm({ clients, people, job }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const isNew = !job;

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          if (isNew) {
            await createJob(f);
          } else {
            const r = await updateJob(job.id, f);
            setMsg(r.message);
            router.refresh();
          }
        });
      }}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Client">
          <ClientPicker clients={clients} value={job?.client_id ?? null} />
        </Field>
        <Field label="Type of work">
          <select name="type" defaultValue={job?.type ?? "Install"} className={inputCls}>
            {(job?.type && !JOB_TYPES.includes(job.type) ? [job.type, ...JOB_TYPES] : JOB_TYPES).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Site address">
          <input name="site" defaultValue={job?.site} placeholder="8 Alwin Close, Aylesbury" className={inputCls} />
        </Field>
        <Field label="Postcode">
          <input name="postcode" defaultValue={job?.postcode} placeholder="HP21 8RP" className={`${inputCls} uppercase`} />
        </Field>
        <div className="md:col-span-2">
          <Field label="What's the job?">
            <TextArea name="description" defaultValue={job?.description} placeholder="8 double sockets and a new radial circuit" />
          </Field>
        </div>
        <Field label="Who we deal with" hint="Name, phone or email of the contact on this job">
          <input name="contact" defaultValue={job?.contact} className={inputCls} />
        </Field>
        <Field label="Round-trip miles from 18 Alwin Close" hint="Exact road miles there and back. Leave empty if not known yet.">
          <input name="miles_round_trip" inputMode="decimal" defaultValue={job?.miles_round_trip ?? ""} className={inputCls} />
        </Field>
        <Field label="Quote value ex VAT">
          <input name="quote_value" inputMode="decimal" defaultValue={job ? job.quote_value || "" : ""} placeholder="0.00" className={inputCls} />
        </Field>
        <Field label="Date received">
          <input type="date" name="received" defaultValue={job?.received ?? ""} className={inputCls} />
        </Field>
      </div>

      {isNew && people && (
        <fieldset>
          <legend className="mb-2 text-[15px] font-medium">Who&apos;s on it</legend>
          <div className="flex flex-wrap gap-3">
            {people.map((p) => (
              <label key={p.id} className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-4 has-[:checked]:border-transparent has-[:checked]:bg-blue-soft">
                <input type="checkbox" name="people" value={p.id} className="h-4 w-4 accent-[var(--blue)]" />
                {p.short_name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {isNew && (
        <Field label="Stage" hint="Anything past Enquiry gives the job its number straight away.">
          <select name="stage" defaultValue="Enquiry" className={`${inputCls} md:w-64`}>
            <option>Enquiry</option>
            <option>Draft quote</option>
            <option>Quoted</option>
            <option>Booked</option>
          </select>
        </Field>
      )}

      {!isNew && job && (
        <div className="grid gap-5 border-t border-line pt-6 md:grid-cols-2">
          <Field label="Tender return deadline">
            <input type="date" name="deadline" defaultValue={job.deadline ?? ""} className={inputCls} />
          </Field>
          <Field label="Quote sent">
            <input type="date" name="quoted_at" defaultValue={job.quoted_at ?? ""} className={inputCls} />
          </Field>
          <Field label="Won or lost on">
            <input type="date" name="outcome_at" defaultValue={job.outcome_at ?? ""} className={inputCls} />
          </Field>
          <Field label="Why it was won or lost">
            <input name="outcome_reason" defaultValue={job.outcome_reason} className={inputCls} />
          </Field>
          <Field label="First day on site">
            <input type="date" name="start_date" defaultValue={job.start_date ?? ""} className={inputCls} />
          </Field>
          <Field label="Last day on site">
            <input type="date" name="end_date" defaultValue={job.end_date ?? ""} className={inputCls} />
          </Field>
          <Field label="Certificates">
            <input name="certs" defaultValue={job.certs} placeholder="EIC, MWC" className={inputCls} />
          </Field>
          <Field label="Building Control">
            <select name="building_control" defaultValue={job.building_control} className={inputCls}>
              <option value="">Not set</option>
              <option>Yes</option>
              <option>No</option>
              <option>N/A</option>
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Drive folder link" hint="The app will create and fill this itself from Phase 2.">
              <input name="drive_folder_url" defaultValue={job.drive_folder_url} className={inputCls} />
            </Field>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryBtn}>
          {pending ? "Saving…" : isNew ? "Create job" : "Save changes"}
        </button>
        <Toast message={msg} />
      </div>
    </form>
  );
}
