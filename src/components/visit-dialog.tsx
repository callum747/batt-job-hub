"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { deleteVisit, saveVisit } from "@/app/(app)/actions";
import { Field, inputCls, primaryBtn, secondaryBtn, textareaCls } from "./ui";

export type VisitDraft = {
  id?: string;
  job_id: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  work: string;
  site: string;
  confirmed: boolean;
  notes: string;
  people: string[];
};
export type JobOption = { id: string; label: string };
type P = { id: string; short_name: string; colour: string };

/** Book or change a visit. Saving puts it in Google Calendar and invites whoever is on it. */
export function VisitDialog({
  draft,
  people,
  jobs,
  lockJob,
  onClose,
}: {
  draft: VisitDraft;
  people: P[];
  jobs: JobOption[];
  lockJob?: boolean;
  onClose: (message?: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [timed, setTimed] = useState(Boolean(draft.start_time));
  const isNew = !draft.id;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={isNew ? "Book a visit" : "Change visit"} className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-bg p-5 shadow-xl sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[22px] font-semibold">{isNew ? "Book a visit" : "Change visit"}</h2>
          <button type="button" onClick={() => onClose()} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (!timed) {
              f.delete("start");
              f.delete("end");
            }
            start(async () => {
              const r = await saveVisit(draft.id ?? null, f);
              if (!r.ok) return setError(r.message);
              router.refresh();
              onClose(r.message);
            });
          }}
        >
          {lockJob ? (
            <input type="hidden" name="job_id" value={draft.job_id ?? ""} />
          ) : (
            <Field label="Job">
              <select name="job_id" defaultValue={draft.job_id ?? ""} className={inputCls}>
                <option value="">Not on a job (call, meeting, day off)</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Date">
            <input type="date" name="date" required defaultValue={draft.date} className={inputCls} />
          </Field>
          <label className="flex items-center gap-3 text-[16px]">
            <input type="checkbox" checked={!timed} onChange={(e) => setTimed(!e.target.checked)} className="h-5 w-5 accent-[var(--blue)]" /> All day
          </label>
          {timed && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start">
                <input type="time" name="start" required defaultValue={draft.start_time?.slice(0, 5) ?? "08:00"} className={inputCls} />
              </Field>
              <Field label="Finish">
                <input type="time" name="end" defaultValue={draft.end_time?.slice(0, 5) ?? ""} className={inputCls} />
              </Field>
            </div>
          )}
          <Field label="What's being done">
            <input name="work" defaultValue={draft.work} placeholder="First fix, survey, testing" className={inputCls} />
          </Field>
          <fieldset>
            <legend className="mb-2 text-[15px] font-medium">Who&apos;s going</legend>
            <div className="flex flex-wrap gap-2">
              {people.map((p) => (
                <label key={p.id} className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-4 has-[:checked]:border-transparent has-[:checked]:bg-blue-soft">
                  <input type="checkbox" name="people" value={p.id} defaultChecked={draft.people.includes(p.id)} className="h-4 w-4 accent-[var(--blue)]" />
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: p.colour }} />
                  {p.short_name}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-3 text-[16px]">
            <input type="checkbox" name="pencilled" defaultChecked={!draft.confirmed} className="h-5 w-5 accent-[var(--blue)]" /> Pencilled in, not confirmed yet
          </label>
          <Field label="Site, if different from the job's">
            <input name="site" defaultValue={draft.site} className={inputCls} />
          </Field>
          <Field label="Notes">
            <textarea name="notes" defaultValue={draft.notes} className={`${textareaCls} min-h-20`} />
          </Field>
          {error && (
            <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-[15px] text-bad">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button type="submit" disabled={pending} className={primaryBtn}>
              {pending ? "Saving…" : isNew ? "Book visit" : "Save visit"}
            </button>
            <button type="button" onClick={() => onClose()} className={secondaryBtn}>
              Cancel
            </button>
            {!isNew && (
              <button
                type="button"
                disabled={pending}
                className="ml-auto h-12 rounded-xl px-4 text-[15px] font-medium text-bad hover:bg-bad/10"
                onClick={() => {
                  if (!confirm("Remove this visit? It will also be taken out of the calendar.")) return;
                  start(async () => {
                    const r = await deleteVisit(draft.id!);
                    if (!r.ok) return setError(r.message);
                    router.refresh();
                    onClose(r.message);
                  });
                }}
              >
                Remove visit
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
