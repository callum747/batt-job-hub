"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus } from "lucide-react";
import { PeopleChips, primaryBtn } from "@/components/ui";
import { VisitDialog, type VisitDraft } from "@/components/visit-dialog";
import { ukDate } from "@/lib/jobs-rules";
import type { PersonRow, VisitRow } from "@/lib/data";
import { retryVisitCalendar } from "../actions";
import { Toast } from "./job-controls";

export function JobVisits({ jobId, visits, people, today }: { jobId: string; visits: VisitRow[]; people: PersonRow[]; today: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<VisitDraft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const active = people.filter((p) => p.active);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={primaryBtn}
          onClick={() => setDraft({ job_id: jobId, date: today, start_time: null, end_time: null, work: "", site: "", confirmed: true, notes: "", people: [] })}
        >
          <Plus className="h-5 w-5" aria-hidden="true" /> Book a visit
        </button>
        <Toast message={msg} />
      </div>
      {visits.length === 0 ? (
        <p className="text-muted">No visits on this job yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {visits.map((v) => (
            <li key={v.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:gap-5">
              <div className="w-36 shrink-0">
                <p className="font-semibold">{ukDate(v.date, { weekday: true })}</p>
                <p className="text-[14px] text-muted">
                  {v.start_time ? `${v.start_time.slice(0, 5)}${v.end_time ? ` to ${v.end_time.slice(0, 5)}` : ""}` : "All day"}
                  {!v.confirmed && " · pencilled in"}
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <p>{v.work || "Visit"}</p>
                {v.notes && <p className="text-[14px] text-muted">{v.notes}</p>}
                <div className="mt-2">
                  <PeopleChips ids={v.people} people={people} size="sm" />
                </div>
                {v.calendar_error && (
                  <p className="mt-2 text-[14px] text-warn">
                    Not in the calendar: {v.calendar_error}{" "}
                    <button
                      type="button"
                      disabled={pending}
                      className="font-medium underline underline-offset-4"
                      onClick={() => start(async () => { setMsg((await retryVisitCalendar(v.id)).message); router.refresh(); })}
                    >
                      Try again
                    </button>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {v.calendar_link && (
                  <a href={v.calendar_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[14px] font-medium text-muted hover:text-text">
                    Calendar <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                )}
                <button type="button" className="h-10 rounded-lg border border-line px-3 text-[14px] font-medium hover:bg-surface" onClick={() => setDraft({ ...v })}>
                  Change
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {draft && (
        <VisitDialog
          draft={draft}
          people={active}
          jobs={[]}
          lockJob
          onClose={(m) => {
            setDraft(null);
            if (m) setMsg(m);
          }}
        />
      )}
    </div>
  );
}
