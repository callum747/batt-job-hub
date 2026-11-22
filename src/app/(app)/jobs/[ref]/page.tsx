import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ExternalLink, FolderOpen } from "lucide-react";
import { Card, LightDot, PeopleChips } from "@/components/ui";
import { findJob, getPeople, getSettings, jobDetail, listClients } from "@/lib/data";
import { gbp } from "@/lib/money";
import { jobLabel, ukDate } from "@/lib/jobs-rules";
import { JobForm } from "../job-form";
import { NoteForm, NotesText, PeopleControl, StageControl, Variations } from "../job-controls";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "money", label: "Quote & money" },
  { key: "visits", label: "Visits" },
  { key: "files", label: "Files" },
  { key: "details", label: "Details" },
];

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const job = await findJob(decodeURIComponent(ref));
  return { title: job ? `${jobLabel(job)} ${job.client_name ?? ""}`.trim() : "Job" };
}

export default async function JobPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ tab?: string; numbered?: string }> }) {
  const [{ ref }, { tab = "overview", numbered }] = await Promise.all([params, searchParams]);
  const job = await findJob(decodeURIComponent(ref));
  if (!job) notFound();
  // Always show a numbered job at its number, e.g. /jobs/Q-553 or /jobs/553 (merged) go to /jobs/555
  const canonical = String(job.number ?? (job.legacy_ref || job.id));
  if (decodeURIComponent(ref) !== canonical) redirect(`/jobs/${canonical}${tab !== "overview" ? `?tab=${tab}` : ""}`);

  const [people, detail, settings, clients] = await Promise.all([getPeople(true), jobDetail(job.id), getSettings(), listClients()]);
  const activePeople = people.filter((p) => p.active || job.people.includes(p.id));
  const m = job.money;
  const base = `/jobs/${canonical}`;
  const where = [job.site, job.postcode].filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/jobs" className="mb-4 inline-flex h-10 items-center gap-1 text-[15px] font-medium text-muted hover:text-text">
        <ChevronLeft className="h-5 w-5" aria-hidden="true" /> Jobs
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[30px] font-semibold leading-tight md:text-[34px]">
            {jobLabel(job)} <span className="font-medium">{job.client_name ?? "No client"}</span>
          </h1>
          <p className="mt-1 text-[17px] text-muted">{where || job.type || "No site yet"}</p>
          {job.also.length > 0 && <p className="mt-1 text-[15px] text-muted">Also covers {job.also.map((n) => `#${n}`).join(", ")}</p>}
        </div>
        <StageControl jobId={job.id} stage={job.stage} />
      </div>

      {numbered && job.number && (
        <p role="status" className="mt-4 rounded-xl bg-blue-soft px-4 py-3 text-[15px] font-medium">
          This job is now #{job.number}. Use that number on the quote, the Drive folder and wholesaler orders.
        </p>
      )}

      <div className="mt-5">
        <PeopleControl jobId={job.id} selected={job.people} people={activePeople} />
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-2 md:gap-3">
        <div className="rounded-2xl border border-line p-3 md:p-4">
          <dt className="text-[13px] text-muted md:text-[14px]">Quote</dt>
          <dd className="mt-1 text-[18px] font-semibold tabular-nums md:text-[24px]">{m.income ? gbp(m.income, { whole: true }) : "–"}</dd>
        </div>
        <div className="rounded-2xl border border-line p-3 md:p-4">
          <dt className="text-[13px] text-muted md:text-[14px]">Spent so far</dt>
          <dd className="mt-1 text-[18px] font-semibold tabular-nums md:text-[24px]">{gbp(m.spent, { whole: true })}</dd>
        </div>
        <div className="rounded-2xl border border-line p-3 md:p-4">
          <dt className="flex items-center gap-1.5 text-[13px] text-muted md:text-[14px]">
            Profit so far <LightDot light={job.light} className="h-2.5 w-2.5 md:h-3 md:w-3" />
          </dt>
          <dd className="mt-1 text-[18px] font-semibold tabular-nums md:text-[24px]">{m.income ? gbp(m.profit, { whole: true }) : "–"}</dd>
          {m.margin !== null && <dd className="text-[13px] font-medium text-muted md:text-[14px]">{m.margin}% margin</dd>}
        </div>
      </dl>

      <nav className="-mx-4 mt-6 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0" aria-label="Job sections">
        <ul className="flex gap-1">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <li key={t.key}>
                <Link
                  href={t.key === "overview" ? base : `${base}?tab=${t.key}`}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-12 items-center whitespace-nowrap border-b-2 px-4 text-[16px] font-medium ${
                    active ? "border-blue text-text" : "border-transparent text-muted hover:text-text"
                  }`}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-6 space-y-6">
        {tab === "overview" && (
          <>
            <Card title="The job">
              <p className="whitespace-pre-line text-[17px]">{job.description || <span className="text-muted">No description yet.</span>}</p>
              <dl className="mt-5 grid gap-4 text-[15px] sm:grid-cols-2">
                <Info label="Type" value={job.type} />
                <Info label="Contact" value={job.contact} />
                <Info label="Received" value={ukDate(job.received)} />
                <Info label="Quote sent" value={ukDate(job.quoted_at)} />
                <Info label="On site" value={[ukDate(job.start_date), ukDate(job.end_date)].filter(Boolean).join(" to ")} />
                <Info label={job.stage === "Lost" ? "Lost because" : "Outcome"} value={[ukDate(job.outcome_at), job.outcome_reason].filter(Boolean).join(", ")} />
              </dl>
            </Card>
            <Card title="Notes">
              <div className="space-y-4">
                <NoteForm jobId={job.id} />
                <NotesText notes={job.notes} />
              </div>
            </Card>
          </>
        )}

        {tab === "money" && (
          <>
            <Card title="Money so far">
              <dl className="divide-y divide-line text-[16px]">
                <Row label="Quote ex VAT" value={gbp(job.quote_value)} />
                <Row label="Approved extras" value={gbp(m.income - job.quote_value)} />
                <Row label="Income" value={gbp(m.income)} strong />
                <Row label={`Labour (${m.visitDays} day${m.visitDays === 1 ? "" : "s"} on site so far)`} value={gbp(m.labour)} />
                <Row
                  label={job.miles_round_trip ? `Travel (${job.miles_round_trip} miles × ${gbp(settings.rates.perMile)} × ${m.visitDays} days)` : "Travel (miles not set yet)"}
                  value={gbp(m.travel)}
                />
                <Row label="Materials, wholesaler invoices and other costs" value={gbp(m.otherCosts)} />
                <Row label="Spent so far" value={gbp(m.spent)} strong />
                <Row
                  label="Profit"
                  value={
                    <span className="inline-flex items-center gap-2">
                      {gbp(m.profit)} {m.margin !== null && <span className="text-muted">({m.margin}%)</span>} <LightDot light={job.light} />
                    </span>
                  }
                  strong
                />
              </dl>
              <p className="mt-4 text-[14px] text-muted">
                Green at {settings.margins.green}% or more, red below {settings.margins.red}%. Labour uses each person&apos;s day cost from Settings.
              </p>
            </Card>
            <Card title="Extras">
              <Variations jobId={job.id} items={detail.variations} />
            </Card>
            {detail.costs.length > 0 && (
              <Card title="Costs">
                <ul className="divide-y divide-line">
                  {detail.costs.map((c) => (
                    <li key={c.id} className="flex justify-between gap-3 py-3">
                      <span>
                        {c.description || c.kind} <span className="text-muted">{ukDate(c.date)}</span>
                      </span>
                      <span className="tabular-nums">{gbp(c.amount)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <p className="text-[15px] text-muted">Pricing with the pricing spreadsheet and making the quote document come next, in the quotes step.</p>
          </>
        )}

        {tab === "visits" && (
          <Card title="Visits">
            {detail.visits.length === 0 ? (
              <p className="text-muted">No visits on this job yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {detail.visits.map((v) => (
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
                      <div className="mt-2"><PeopleChips ids={v.people} people={people} size="sm" /></div>
                    </div>
                    {v.calendar_link && (
                      <a href={v.calendar_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[14px] font-medium text-muted hover:text-text">
                        Calendar <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-[14px] text-muted">Booking visits here, with the week planner and Google Calendar invites, comes in the next step.</p>
          </Card>
        )}

        {tab === "files" && (
          <Card title="Files">
            {job.drive_folder_url ? (
              <a href={job.drive_folder_url} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center gap-2 rounded-xl border border-line px-5 font-medium hover:bg-surface">
                <FolderOpen className="h-5 w-5 text-blue" aria-hidden="true" /> Open the job&apos;s Drive folder
              </a>
            ) : (
              <p className="text-muted">No Drive folder linked yet.</p>
            )}
            {job.links.length > 0 && (
              <ul className="mt-4 space-y-2">
                {job.links.map((l) => (
                  <li key={l.url}>
                    <a href={l.url} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">{l.name || l.url}</a>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-[14px] text-muted">Creating the folder and showing its files here comes in the next step.</p>
          </Card>
        )}

        {tab === "details" && (
          <Card title="Details">
            <JobForm clients={clients} job={job} />
          </Card>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{value || "–"}</dd>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 py-3 ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
