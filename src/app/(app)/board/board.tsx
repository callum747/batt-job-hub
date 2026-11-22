"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { LightDot, PeopleChips, jobHref } from "@/components/ui";
import { BOARD_STAGES, STAGES, jobLabel, type Stage } from "@/lib/jobs-rules";
import { gbp } from "@/lib/money";
import type { JobWithMoney, PersonRow } from "@/lib/data";
import { setStage } from "../actions";

export function Board({ jobs, people }: { jobs: JobWithMoney[]; people: PersonRow[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [items, moveLocal] = useOptimistic(jobs, (state, m: { id: string; stage: Stage }) =>
    state.map((j) => (j.id === m.id ? { ...j, stage: m.stage } : j)),
  );

  function move(id: string, stage: Stage) {
    const job = items.find((j) => j.id === id);
    if (!job || job.stage === stage) return;
    start(async () => {
      moveLocal({ id, stage });
      try {
        const r = await setStage(id, stage);
        setMsg(r.numbered ? r.message : `${jobLabel(job)}: ${r.message}`);
      } catch (e) {
        setMsg((e as Error).message);
      }
      router.refresh();
    });
  }

  return (
    <>
      {msg && (
        <p role="status" className="mb-4 rounded-xl bg-blue-soft px-4 py-3 text-[15px] font-medium">
          {msg}
        </p>
      )}
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-6 md:-mx-8 md:px-8">
        {BOARD_STAGES.map((stage) => {
          const col = items.filter((j) => j.stage === stage);
          const total = col.reduce((s, j) => s + j.money.income, 0);
          return (
            <section
              key={stage}
              aria-label={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((o) => (o === stage ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                move(e.dataTransfer.getData("text/job"), stage);
              }}
              className={`flex w-72 shrink-0 flex-col rounded-2xl p-3 transition ${over === stage ? "bg-blue-soft ring-2 ring-blue" : "bg-surface"}`}
            >
              <h2 className="flex items-baseline justify-between px-1 pb-3">
                <span className="text-[16px] font-semibold">{stage}</span>
                <span className="text-[14px] text-muted">
                  {col.length}
                  {total > 0 && ` · ${gbp(total, { whole: true })}`}
                </span>
              </h2>
              <ul className="flex min-h-24 flex-col gap-2">
                {col.map((j) => (
                  <li
                    key={j.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/job", j.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className="cursor-grab rounded-xl border border-line bg-bg p-3 shadow-sm active:cursor-grabbing"
                  >
                    <Link href={jobHref(j)} draggable={false} className="block">
                      <p className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{jobLabel(j)}</span>
                        {j.money.income > 0 && (
                          <span className="flex items-center gap-1.5 text-[14px] tabular-nums">
                            {gbp(j.money.income, { whole: true })} <LightDot light={j.light} className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[15px] font-medium">{j.client_name || "No client"}</p>
                      <p className="truncate text-[14px] text-muted">{j.site || j.type}</p>
                    </Link>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <PeopleChips ids={j.people} people={people} size="sm" />
                      <label className="md:hidden">
                        <span className="sr-only">Move {jobLabel(j)} to</span>
                        <select
                          value={j.stage}
                          onChange={(e) => move(j.id, e.target.value as Stage)}
                          className="h-9 rounded-lg border border-line bg-bg px-2 text-[14px]"
                        >
                          {STAGES.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="text-[14px] text-muted">Paid, closed and lost jobs are on the Jobs page under Finished.</p>
    </>
  );
}
