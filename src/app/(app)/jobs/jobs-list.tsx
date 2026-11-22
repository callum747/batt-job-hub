"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { LightDot, PeopleChips, StageBadge, jobHref } from "@/components/ui";
import { gbp } from "@/lib/money";
import { jobLabel, parseJobNumber, type Stage } from "@/lib/jobs-rules";
import type { JobWithMoney, PersonRow } from "@/lib/data";

const FILTERS: { key: string; label: string; stages: Stage[] | null }[] = [
  { key: "open", label: "Open", stages: ["Enquiry", "Draft quote", "Quoted", "Booked", "In progress", "Complete", "Invoiced", "On hold"] },
  { key: "quotes", label: "Quotes", stages: ["Enquiry", "Draft quote", "Quoted"] },
  { key: "on", label: "Work on", stages: ["Booked", "In progress", "Complete"] },
  { key: "invoiced", label: "Waiting for payment", stages: ["Invoiced"] },
  { key: "done", label: "Finished", stages: ["Paid", "Closed", "Lost"] },
  { key: "all", label: "All", stages: null },
];

export function JobsList({ jobs, people, show }: { jobs: JobWithMoney[]; people: PersonRow[]; show: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const filter = FILTERS.find((f) => f.key === show) ?? FILTERS[0];

  const shown = useMemo(() => {
    const n = parseJobNumber(q);
    const t = q.trim().toLowerCase();
    return jobs.filter((j) => {
      if (filter.stages && !filter.stages.includes(j.stage)) return false;
      if (!t) return true;
      if (n !== null && (j.number === n || j.also.includes(n))) return true;
      return [j.client_name, j.site, j.postcode, j.description, j.legacy_ref, j.type, j.contact]
        .some((v) => (v ?? "").toLowerCase().includes(t));
    });
  }, [jobs, filter, q]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, f.stages ? jobs.filter((j) => f.stages!.includes(j.stage)).length : jobs.length])),
    [jobs],
  );

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0" role="tablist" aria-label="Which jobs">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={f.key === filter.key}
              onClick={() => router.replace(f.key === "open" ? "/jobs" : `/jobs?show=${f.key}`, { scroll: false })}
              className={`h-11 shrink-0 rounded-full px-4 text-[15px] font-medium transition ${
                f.key === filter.key ? "bg-blue text-blue-ink" : "bg-surface text-muted hover:text-text"
              }`}
            >
              {f.label} <span className="ml-1 opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <label className="relative flex h-11 items-center lg:ml-auto lg:w-72">
          <span className="sr-only">Filter these jobs</span>
          <Search className="pointer-events-none absolute left-3.5 h-5 w-5 text-muted" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Number, client or site"
            className="h-11 w-full rounded-xl border border-line bg-bg pl-11 pr-4 text-[16px] outline-none focus:border-blue"
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl bg-surface px-5 py-10 text-center text-muted">No jobs match.</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-line md:block">
            <table className="w-full min-w-[56rem] table-fixed text-left">
              <thead className="bg-surface text-[14px] text-muted">
                <tr>
                  <th className="w-24 px-4 py-3 font-medium">Job</th>
                  <th className="px-4 py-3 font-medium">Client and site</th>
                  <th className="w-36 px-4 py-3 font-medium">Stage</th>
                  <th className="w-44 px-4 py-3 font-medium">Who</th>
                  <th className="w-28 px-4 py-3 text-right font-medium">Quote</th>
                  <th className="w-24 px-4 py-3 text-right font-medium">Spent</th>
                  <th className="w-32 px-4 py-3 text-right font-medium">Profit</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((j) => (
                  <tr key={j.id} className="group relative border-t border-line hover:bg-surface">
                    <td className="px-4 py-3.5 align-top">
                      <Link href={jobHref(j)} className="whitespace-nowrap text-[16px] font-semibold after:absolute after:inset-0">
                        {jobLabel(j)}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <p className="truncate font-medium">{j.client_name || "No client"}</p>
                      <p className="truncate text-[15px] text-muted">{[j.site, j.postcode].filter(Boolean).join(", ") || j.type}</p>
                    </td>
                    <td className="px-4 py-3.5 align-top"><StageBadge stage={j.stage} /></td>
                    <td className="whitespace-nowrap px-4 py-3.5 align-top"><PeopleChips ids={j.people} people={people} size="sm" nowrap /></td>
                    <td className="px-4 py-3.5 text-right align-top tabular-nums">{j.quote_value || j.money.income ? <span className={j.stage === "Lost" ? "text-muted line-through" : ""}>{gbp(j.money.income || j.quote_value, { whole: true })}</span> : "–"}</td>
                    <td className="px-4 py-3.5 text-right align-top tabular-nums text-muted">{j.money.spent ? gbp(j.money.spent, { whole: true }) : "–"}</td>
                    <td className="px-4 py-3.5 text-right align-top tabular-nums">
                      {j.money.income ? (
                        <span className="inline-flex items-center gap-2">
                          {gbp(j.money.profit, { whole: true })}
                          <LightDot light={j.light} />
                        </span>
                      ) : (
                        "–"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone cards */}
          <ul className="space-y-3 md:hidden">
            {shown.map((j) => (
              <li key={j.id}>
                <Link href={jobHref(j)} className="block rounded-2xl border border-line p-4 active:bg-surface">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[18px] font-semibold">{jobLabel(j)} <span className="font-medium">{j.client_name || "No client"}</span></p>
                      <p className="truncate text-[15px] text-muted">{[j.site, j.postcode].filter(Boolean).join(", ") || j.type}</p>
                    </div>
                    <StageBadge stage={j.stage} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <PeopleChips ids={j.people} people={people} size="sm" />
                    {j.money.income > 0 && (
                      <span className="flex items-center gap-2 text-[15px] tabular-nums">
                        {gbp(j.money.income, { whole: true })}
                        <LightDot light={j.light} />
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
