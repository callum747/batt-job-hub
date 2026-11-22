"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PeopleChips } from "@/components/ui";
import { VisitDialog, type JobOption, type VisitDraft } from "@/components/visit-dialog";
import { ukDate } from "@/lib/jobs-rules";
import type { DiaryVisit, PersonRow } from "@/lib/data";
import { moveVisit } from "../actions";

type Props = {
  days: string[];
  today: string;
  visits: DiaryVisit[];
  people: PersonRow[];
  jobs: JobOption[];
  prev: string;
  next: string;
  thisWeek: string;
};
type Move = { id: string; date: string; from: string | null; to: string | null };

const NOBODY = "nobody";
const dayName = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
const dayNum = (iso: string) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;
const timeOf = (v: DiaryVisit) => (v.start_time ? `${v.start_time.slice(0, 5)}${v.end_time ? `–${v.end_time.slice(0, 5)}` : ""}` : "All day");
const titleOf = (v: DiaryVisit) => (v.job_id ? `${v.job_number ? `#${v.job_number}` : v.job_ref || "Job"} ${v.client_name ?? ""}`.trim() : v.work || "Not on a job");

export function Planner({ days, today, visits, people, jobs, prev, next, thisWeek }: Props) {
  const router = useRouter();
  const [, start] = useTransition();
  const [draft, setDraft] = useState<VisitDraft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [items, moveLocal] = useOptimistic(visits, (state, m: Move) =>
    state.map((v) => {
      if (v.id !== m.id) return v;
      let who = v.people;
      if (m.from !== m.to) {
        who = who.filter((p) => p !== m.from);
        if (m.to && !who.includes(m.to)) who = [...who, m.to];
      }
      return { ...v, date: m.date, people: who };
    }),
  );
  const active = people.filter((p) => p.active);
  const rows = [...active.map((p) => ({ key: p.id, name: p.short_name, colour: p.colour })), { key: NOBODY, name: "Nobody yet", colour: "var(--line)" }];
  const inCell = (row: string, day: string) => items.filter((v) => v.date === day && (row === NOBODY ? v.people.length === 0 : v.people.includes(row)));

  function drop(e: React.DragEvent, row: string, day: string) {
    e.preventDefault();
    setOver(null);
    let data: { id: string; from: string } | null = null;
    try {
      data = JSON.parse(e.dataTransfer.getData("text/visit"));
    } catch {}
    if (!data) return;
    const v = items.find((x) => x.id === data!.id);
    const from = data.from === NOBODY ? null : data.from;
    const to = row === NOBODY ? null : row;
    if (!v || (v.date === day && from === to)) return;
    const move = { id: v.id, date: day, from, to };
    start(async () => {
      moveLocal(move);
      const r = await moveVisit(move.id, move.date, move.from, move.to);
      setMsg(r.message);
      router.refresh();
    });
  }

  const newVisit = (day: string, row?: string): VisitDraft => ({
    job_id: null, date: day, start_time: null, end_time: null, work: "", site: "", confirmed: true, notes: "", people: row && row !== NOBODY ? [row] : [],
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={`/diary?week=${prev}`} className="flex h-11 w-11 items-center justify-center rounded-xl border border-line hover:bg-surface" aria-label="Previous week">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <Link href={`/diary?week=${next}`} className="flex h-11 w-11 items-center justify-center rounded-xl border border-line hover:bg-surface" aria-label="Next week">
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Link>
        <p className="px-2 text-[17px] font-semibold">
          {ukDate(days[0])} to {ukDate(days[6])}
        </p>
        {days[0] !== thisWeek && (
          <Link href="/diary" className="flex h-11 items-center rounded-xl border border-line px-4 text-[15px] font-medium hover:bg-surface">
            This week
          </Link>
        )}
        <button type="button" onClick={() => setDraft(newVisit(days.includes(today) ? today : days[0]))} className="ml-auto inline-flex h-11 items-center gap-2 rounded-xl bg-blue px-4 text-[15px] font-semibold text-blue-ink hover:brightness-95">
          <Plus className="h-5 w-5" aria-hidden="true" /> Book a visit
        </button>
      </div>
      {msg && (
        <p role="status" className="mb-4 rounded-xl bg-blue-soft px-4 py-3 text-[15px] font-medium">
          {msg}
        </p>
      )}

      {/* Laptop: a row per person, a column per day */}
      <div className="hidden overflow-x-auto rounded-2xl border border-line md:block">
        <div className="grid min-w-[60rem] grid-cols-[7rem_repeat(7,minmax(0,1fr))]">
          <div className="border-b border-line bg-surface" />
          {days.map((d) => (
            <div key={d} className={`border-b border-l border-line px-3 py-2 text-[14px] ${d === today ? "bg-blue-soft font-semibold" : "bg-surface text-muted"}`}>
              {dayName(d)} {dayNum(d)}
            </div>
          ))}
          {rows.map((row, ri) => (
            <div key={row.key} className="contents">
              <div className={`flex items-start gap-2 px-3 py-3 text-[15px] font-semibold ${ri ? "border-t border-line" : ""}`}>
                <span className="mt-1.5 inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: row.colour }} />
                <span className={row.key === NOBODY ? "font-medium text-muted" : ""}>{row.name}</span>
              </div>
              {days.map((d) => {
                const cell = `${row.key}|${d}`;
                return (
                  <div
                    key={d}
                    data-cell={cell}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOver(cell);
                    }}
                    onDragLeave={() => setOver((o) => (o === cell ? null : o))}
                    onDrop={(e) => drop(e, row.key, d)}
                    className={`group relative min-h-24 space-y-1.5 border-l border-line p-1.5 ${ri ? "border-t" : ""} ${over === cell ? "bg-blue-soft" : d < today ? "bg-surface/50" : ""}`}
                  >
                    {inCell(row.key, d).map((v) => (
                      <div
                        key={v.id}
                        role="button"
                        tabIndex={0}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/visit", JSON.stringify({ id: v.id, from: row.key }));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() => setDraft({ ...v })}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setDraft({ ...v })}
                        className={`cursor-grab rounded-lg border border-line bg-bg px-2 py-1.5 text-[13px] leading-snug shadow-sm hover:border-blue ${v.confirmed ? "" : "border-dashed"}`}
                        style={{ borderLeftWidth: 4, borderLeftColor: row.colour }}
                      >
                        <p className="truncate font-semibold">{titleOf(v)}</p>
                        <p className="truncate text-muted">{[timeOf(v), v.job_id ? v.work : ""].filter(Boolean).join(" · ")}</p>
                        {v.calendar_error && (
                          <p className="flex items-center gap-1 text-warn" title={v.calendar_error}>
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Not in calendar
                          </p>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setDraft(newVisit(d, row.key))}
                      className="absolute bottom-1 right-1 hidden h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text group-hover:flex focus:flex"
                      aria-label={`Book a visit for ${row.name} on ${ukDate(d)}`}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Phone: the week as a list, a day at a time */}
      <div className="space-y-5 md:hidden">
        {days.map((d) => {
          const list = items.filter((v) => v.date === d);
          return (
            <section key={d}>
              <h2 className={`mb-2 flex items-center justify-between text-[17px] font-semibold ${d < today ? "text-muted" : ""}`}>
                <span>
                  {d === today ? "Today" : ukDate(d, { weekday: true })}
                </span>
                <button type="button" onClick={() => setDraft(newVisit(d))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-line" aria-label={`Book a visit on ${ukDate(d)}`}>
                  <Plus className="h-5 w-5" aria-hidden="true" />
                </button>
              </h2>
              {list.length === 0 ? (
                <p className="rounded-xl bg-surface px-4 py-3 text-[15px] text-muted">Nothing booked</p>
              ) : (
                <ul className="space-y-2">
                  {list.map((v) => (
                    <li key={v.id}>
                      <button type="button" onClick={() => setDraft({ ...v })} className={`block w-full rounded-xl border border-line p-4 text-left active:bg-surface ${v.confirmed ? "" : "border-dashed"}`}>
                        <p className="font-semibold">{titleOf(v)}</p>
                        <p className="truncate text-[15px] text-muted">{[timeOf(v), v.job_id ? v.work : "", v.site || v.job_site].filter(Boolean).join(" · ")}</p>
                        <div className="mt-2">
                          <PeopleChips ids={v.people} people={people} size="sm" />
                        </div>
                        {v.calendar_error && <p className="mt-2 text-[14px] text-warn">Not in the calendar yet</p>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {draft && (
        <VisitDialog
          draft={draft}
          people={active}
          jobs={jobs}
          onClose={(m) => {
            setDraft(null);
            if (m) setMsg(m);
          }}
        />
      )}
    </>
  );
}
