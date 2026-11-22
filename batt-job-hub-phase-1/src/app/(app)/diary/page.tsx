import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/page";
import { PeopleChips } from "@/components/ui";
import { getPeople, listVisits } from "@/lib/data";
import { todayUK, ukDate } from "@/lib/jobs-rules";

export const metadata = { title: "Diary" };

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function DiaryPage() {
  const today = todayUK();
  const [visits, people] = await Promise.all([listVisits(addDays(today, -7), addDays(today, 120)), getPeople(true)]);
  const byDay = new Map<string, typeof visits>();
  for (const v of visits) byDay.set(v.date, [...(byDay.get(v.date) ?? []), v]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Diary" intro="Visits from last week onwards. The week planner with drag to reassign comes next." />
      {byDay.size === 0 && <p className="rounded-2xl bg-surface px-5 py-10 text-center text-muted">Nothing booked.</p>}
      <div className="space-y-6">
        {[...byDay.entries()].map(([day, list]) => (
          <section key={day}>
            <h2 className={`mb-2 text-[17px] font-semibold ${day < today ? "text-muted" : ""}`}>
              {day === today ? "Today" : ukDate(day, { weekday: true })} <span className="font-normal text-muted">{ukDate(day)}</span>
            </h2>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {list.map((v) => (
                <li key={v.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                  <span className="w-28 shrink-0 text-[15px] text-muted">
                    {v.start_time ? `${v.start_time.slice(0, 5)}${v.end_time ? `–${v.end_time.slice(0, 5)}` : ""}` : "All day"}
                    {!v.confirmed && <span className="block">Pencilled in</span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {v.job_id ? (
                        <Link href={`/jobs/${v.job_number ?? v.job_id}`} className="underline-offset-4 hover:underline">
                          {v.job_number ? `#${v.job_number}` : v.job_ref || "Job"} {v.client_name}
                        </Link>
                      ) : (
                        "Not on a job"
                      )}
                    </p>
                    <p className="truncate text-[15px] text-muted">{[v.work, v.site].filter(Boolean).join(" · ")}</p>
                  </div>
                  <PeopleChips ids={v.people} people={people} size="sm" />
                  {v.calendar_link && (
                    <a href={v.calendar_link} target="_blank" rel="noreferrer" className="text-muted hover:text-text" aria-label="Open in Google Calendar">
                      <ExternalLink className="h-5 w-5" aria-hidden="true" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
