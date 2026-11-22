import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, FileText, FolderOpen } from "lucide-react";
import { Card, LightDot } from "@/components/ui";
import { findJob, getPeople, getSettings, jobDetail, listClients } from "@/lib/data";
import { gbp } from "@/lib/money";
import { jobLabel, todayUK, ukDate } from "@/lib/jobs-rules";
import { currentPerson } from "@/lib/auth";
import { errorText, googleConnected } from "@/lib/google/client";
import { listJobFiles, type FolderListing } from "@/lib/google/drive";
import { ConnectGoogleButton } from "@/components/connect-google";
import { secondaryBtn } from "@/components/ui";
import { JobVisits } from "../job-visits";
import { FolderButton } from "../job-files";
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
            <JobVisits jobId={job.id} visits={detail.visits} people={people} today={todayUK()} />
            <p className="mt-4 text-[14px] text-muted">Booking a visit puts it in the shared calendar and invites whoever is going.</p>
          </Card>
        )}

        {tab === "files" && <FilesTab job={job} />}

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

async function FilesTab({ job }: { job: { id: string; number: number | null; drive_folder_id: string; drive_folder_url: string; drive_error: string; links: { name: string; url: string }[] } }) {
  const me = await currentPerson();
  const connected = me ? await googleConnected(me.email) : false;
  let listing: FolderListing | null = null;
  let problem = "";
  if (connected && job.drive_folder_id) {
    try {
      listing = await listJobFiles(me!.email, job.drive_folder_id);
    } catch (e) {
      problem = errorText(e);
    }
  }
  const count = listing?.reduce((n, f) => n + f.files.length, 0) ?? 0;

  return (
    <Card title="Files">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          {job.drive_folder_url && (
            <a href={job.drive_folder_url} target="_blank" rel="noreferrer" className={secondaryBtn}>
              <FolderOpen className="h-5 w-5 text-blue" aria-hidden="true" /> Open in Drive
            </a>
          )}
          {connected && job.number !== null && !job.drive_folder_id && <FolderButton jobId={job.id} label="Create the Drive folder" />}
          {connected && job.drive_error && job.drive_folder_id && <FolderButton jobId={job.id} label="Try again" />}
        </div>

        {!connected && (
          <div className="rounded-xl bg-surface p-4">
            <p className="mb-3">Connect Google to see this job&apos;s files here and have folders made for you.</p>
            <ConnectGoogleButton className={secondaryBtn}>Connect Google</ConnectGoogleButton>
          </div>
        )}
        {job.number === null && <p className="text-muted">The folder is made when the job gets its number.</p>}
        {job.drive_error && <p className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-[15px]">{job.drive_error}</p>}
        {problem && <p className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-[15px]">Couldn&apos;t list the files. {problem}</p>}

        {listing && (
          <>
            <p className="text-[15px] text-muted">
              {count} file{count === 1 ? "" : "s"} in the job folder.
            </p>
            <ul className="space-y-4">
              {listing.map((folder) => (
                <li key={folder.id}>
                  <p className="font-semibold">
                    {folder.url ? (
                      <a href={folder.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                        {folder.name}
                      </a>
                    ) : (
                      folder.name
                    )}
                    <span className="ml-2 text-[14px] font-normal text-muted">{folder.files.length || "empty"}</span>
                  </p>
                  {folder.files.length > 0 && (
                    <ul className="mt-1 divide-y divide-line rounded-xl border border-line">
                      {folder.files.map((f) => (
                        <li key={f.id}>
                          <a href={f.webViewLink} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-surface">
                            <FileText className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate">{f.name}</span>
                            <span className="shrink-0 text-[14px] text-muted">{ukDate(f.modifiedTime?.slice(0, 10))}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {job.links.length > 0 && (
          <ul className="space-y-2">
            {job.links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">
                  {l.name || l.url}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
