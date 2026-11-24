import Link from "next/link";
import { Suspense } from "react";
import { ChaseButtons } from "./chase-buttons";
import { quoteReminders, stuckReminders } from "@/lib/reminders-run";
import { currentPerson } from "@/lib/auth";
import { googleConnected } from "@/lib/google/client";
import { readLedger } from "@/lib/google/ledger-run";
import { dueForChase } from "@/lib/ledger";
import { CalendarDays } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";
import { Card, LightDot, PeopleChips, Stat, jobHref } from "@/components/ui";
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
  const [toChase, stuck] = await Promise.all([quoteReminders(jobs, today), stuckReminders(jobs, today)]);
  const sum = (list: typeof jobs) => list.reduce((s, j) => s + j.money.income, 0);
  const todays = visits.filter((v) => v.date === today);
  const coming = visits.filter((v) => v.date > today);

  return (
    <>
      <PageHeader title="Today" intro={longDate()} />
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Stat label="Live quotes" value={gbp(sum(quotes), { whole: true })} sub={`${quotes.length} job${quotes.length === 1 ? "" : "s"}`} href="/jobs?show=quotes" />
        <Stat label="Work on" value={gbp(sum(on), { whole: true })} sub={`${on.length} job${on.length === 1 ? "" : "s"}`} href="/jobs?show=on" />
        <Stat label="Unpaid invoices" value={gbp(sum(invoiced), { whole: true })} sub={`${invoiced.length} job${invoiced.length === 1 ? "" : "s"}`} href="/jobs?show=invoiced" />
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 md:mt-6 md:gap-6 lg:grid-cols-2">
        <Card title="Today on site">
          {todays.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No visits today" text="Visits booked in the diary show here, with who is going where." />
          ) : (
            <VisitList visits={todays} people={people} />
          )}
        </Card>
        <div className="min-w-0 space-y-4 md:space-y-6">
          {toChase.length > 0 && (
            <Card title="Quotes to chase">
              <p className="mb-2 text-[14px] text-muted">Sent with no answer and due a chase today. Each one is chased a week after it went, then weekly.</p>
              <ul className="divide-y divide-line">
                {toChase.map((q) => (
                  <li key={q.id} className="py-3">
                    <Link href={q.href} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1 text-[15px] hover:bg-surface">
                      <span className="w-14 text-[15px] font-semibold tabular-nums">{q.label}</span>
                      <span className="min-w-0 flex-1 truncate">{q.client} <span className="text-muted">{q.site}</span></span>
                      <span className="shrink-0 text-[14px] font-medium tabular-nums">{gbp(q.value, { whole: true })}</span>
                    </Link>
                    <p className="text-[13px] text-muted">
                      Sent {ukDate(q.quotedAt)}, {q.daysSinceSent} days ago.{" "}
                      {q.chases === 0 ? "Not chased yet." : `Chased ${q.chases === 1 ? "once" : `${q.chases} times`}, last on ${ukDate(q.lastChased)}.`}
                      {q.chases >= 3 && " Three chases and no answer: worth marking it Lost?"}
                    </p>
                    <ChaseButtons jobId={q.id} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Suspense fallback={null}>
            <InvoicesToChase />
          </Suspense>
          {stuck.length > 0 && (
            <Card title="Needs a nudge">
              <ul className="divide-y divide-line">
                {stuck.map((j) => (
                  <li key={j.id}>
                    <Link href={j.href} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 text-[15px] hover:bg-surface">
                      <span className="w-14 text-[15px] font-semibold tabular-nums">{j.label}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{j.client || j.site}</span>
                        <span className="block text-[13px] text-muted">{j.why}</span>
                      </span>
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
                    <Link href={jobHref(j)} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-[15px] hover:bg-surface">
                      <span className="w-14 text-[15px] font-semibold tabular-nums">{jobLabel(j)}</span>
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

/** Invoices the ledger says are due a chase today. Loaded after the rest of the page, as it reads the Google Sheet. */
async function InvoicesToChase() {
  const me = await currentPerson();
  if (!me || me.email === "preview@localhost" || !(await googleConnected(me.email))) return null;
  let due: Awaited<ReturnType<typeof readLedger>>["invoices"] = [];
  try {
    const today = todayUK();
    due = (await readLedger(me.email)).invoices.filter((i) => dueForChase(i, today));
  } catch {
    return null;
  }
  if (due.length === 0) return null;
  return (
    <Card title="Invoices to chase">
      <p className="mb-2 text-[14px] text-muted">Due or overdue, and due a chase today.</p>
      <ul className="divide-y divide-line">
        {due.map((i) => (
          <li key={i.number}>
            <Link href="/invoices" className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-[15px] hover:bg-surface">
              <span className="w-20 text-[15px] font-semibold tabular-nums">{i.number}</span>
              <span className="min-w-0 flex-1 truncate">{i.client}</span>
              <span className="shrink-0 text-right text-[13px] text-muted">
                <span className="block text-[14px] font-medium text-text tabular-nums">{gbp(i.payable ?? i.gross ?? 0)}</span>
                {i.daysOverdue > 0 ? `${i.daysOverdue} days overdue` : "due today"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[14px] text-muted">Open Invoices to draft the chaser.</p>
    </Card>
  );
}

function VisitList({ visits, people, showDate }: { visits: DiaryVisit[]; people: PersonRow[]; showDate?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {visits.map((v) => (
        <li key={v.id}>
          <Link href={v.job_id ? `/jobs/${v.job_number ?? v.job_id}?tab=visits` : "/diary"} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-3 hover:bg-surface">
            {/* When: a small block so the eye finds the day or time first. */}
            <span className="w-[4.5rem] shrink-0 pt-0.5 text-[13px] font-semibold leading-tight text-muted">
              {showDate ? ukDate(v.date, { weekday: true }).split(" ").slice(0, 2).join(" ") : v.start_time ? v.start_time.slice(0, 5) : "All day"}
              {showDate && <span className="block font-medium">{v.start_time ? v.start_time.slice(0, 5) : "All day"}</span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">
                {v.job_number ? `#${v.job_number} ` : ""}
                {v.client_name ?? "Not on a job"}
              </span>
              {v.work && <span className="block truncate text-[14px] text-muted">{v.work}</span>}
              <span className="mt-1.5 block"><PeopleChips ids={v.people} people={people} size="sm" /></span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
