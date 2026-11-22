import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";
import { Card, LightDot, PeopleChips, jobHref } from "@/components/ui";
import { getPeople, listJobs, listVisits, type DiaryVisit, type PersonRow } from "@/lib/data";
import { gbp } from "@/lib/money";
import { jobLabel, todayUK, ukDate } from "@/lib/jobs-rules";

export const metadata = { title: "Today" };

function longDate() {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date());
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function TodayPage() {
  const today = todayUK();
  const [jobs, visits, people] = await Promise.all([listJobs(), listVisits(today, addDays(today, 7)), getPeople(true)]);
  const quotes = jobs.filter((j) => j.stage === "Draft quote" || j.stage === "Quoted");
  const on = jobs.filter((j) => ["Booked", "In progress", "Complete"].includes(j.stage));
  const invoiced = jobs.filter((j) => j.stage === "Invoiced");
  const chaseBefore = addDays(today, -7);
  const toChase = jobs.filter((j) => j.stage === "Quoted" && j.quoted_at && j.quoted_at <= chaseBefore);
  const sum = (list: typeof jobs) => list.reduce((s, j) => s + j.money.income, 0);
  const todays = visits.filter((v) => v.date === today);
  const coming = visits.filter((v) => v.date > today);

  return (
    <>
      <PageHeader title="Today" intro={longDate()} />
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {[
          { label: "Live quotes", value: gbp(sum(quotes), { whole: true }), sub: `${quotes.length} job${quotes.length === 1 ? "" : "s"}`, href: "/jobs?show=quotes" },
          { label: "Work on", value: gbp(sum(on), { whole: true }), sub: `${on.length} job${on.length === 1 ? "" : "s"}`, href: "/jobs?show=on" },
          { label: "Invoiced, not paid", value: gbp(sum(invoiced), { whole: true }), sub: `${invoiced.length} job${invoiced.length === 1 ? "" : "s"}`, href: "/jobs?show=invoiced" },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="rounded-2xl border border-line p-3 hover:bg-surface md:p-5">
            <p className="text-[14px] leading-tight text-muted md:text-[15px]">{s.label}</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums md:text-[30px]">{s.value}</p>
            <p className="text-[13px] text-muted md:text-[14px]">{s.sub}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Today on site">
          {todays.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No visits today" text="Visits booked in the diary show here, with who is going where." />
          ) : (
            <VisitList visits={todays} people={people} />
          )}
        </Card>
        <div className="space-y-6">
          {toChase.length > 0 && (
            <Card title="Quotes to chase">
              <p className="mb-3 text-[15px] text-muted">Sent more than 7 days ago with no answer.</p>
              <ul className="divide-y divide-line">
                {toChase.map((j) => (
                  <li key={j.id}>
                    <Link href={jobHref(j)} className="flex items-center gap-3 py-3">
                      <span className="w-16 font-semibold">{jobLabel(j)}</span>
                      <span className="min-w-0 flex-1 truncate">{j.client_name}</span>
                      <span className="text-[14px] text-muted">sent {ukDate(j.quoted_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Next 7 days">
            {coming.length === 0 ? <p className="text-muted">Nothing booked.</p> : <VisitList visits={coming} people={people} showDate />}
          </Card>
          {on.length > 0 && (
            <Card title="Work on">
              <ul className="divide-y divide-line">
                {on.map((j) => (
                  <li key={j.id}>
                    <Link href={jobHref(j)} className="flex items-center gap-3 py-3">
                      <span className="w-16 font-semibold">{jobLabel(j)}</span>
                      <span className="min-w-0 flex-1 truncate">{j.client_name} <span className="text-muted">{j.site}</span></span>
                      <LightDot light={j.light} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function VisitList({ visits, people, showDate }: { visits: DiaryVisit[]; people: PersonRow[]; showDate?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {visits.map((v) => (
        <li key={v.id} className="py-3">
          <Link href={v.job_id ? `/jobs/${v.job_number ?? v.job_id}?tab=visits` : "/diary"} className="block">
            <p className="font-medium">
              {showDate && <span className="text-muted">{ukDate(v.date, { weekday: true })} · </span>}
              {v.job_number ? `#${v.job_number} ` : ""}
              {v.client_name ?? "Not on a job"}
            </p>
            <p className="truncate text-[15px] text-muted">{[v.start_time ? v.start_time.slice(0, 5) : "All day", v.work].filter(Boolean).join(" · ")}</p>
            <div className="mt-1.5"><PeopleChips ids={v.people} people={people} size="sm" /></div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
