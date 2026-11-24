import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, FileText, FolderOpen } from "lucide-react";
import { Card, LightDot, Stat } from "@/components/ui";
import { findJob, getPeople, getSettings, jobDetail, listClients } from "@/lib/data";
import { gbp } from "@/lib/money";
import { quoteRef } from "@/lib/google/format";
import { jobLabel, todayUK, ukDate } from "@/lib/jobs-rules";
import { currentPerson } from "@/lib/auth";
import { errorText, gmailConnected, googleConnected } from "@/lib/google/client";
import { listJobFiles, type FolderListing } from "@/lib/google/drive";
import { surveySummary, type SurveySummary } from "@/lib/google/survey-folder";
import { ConnectGoogleButton } from "@/components/connect-google";
import { secondaryBtn } from "@/components/ui";
import { JobVisits } from "../job-visits";
import { FolderButton } from "../job-files";
import { PricingForm, SheetLink } from "../pricing-form";
import { loadPriceList } from "@/lib/google/pricing-run";
import { pricingLight, type Product } from "@/lib/pricing";
import { QuoteForm } from "../quote-form";
import { SurveyForm } from "../survey-form";
import { LongForm } from "../long-form";
import { plusDays } from "@/lib/quote-defaults";
import { quoteEmailStart } from "@/lib/quote-email";
import { findEmail, jobSearch, unescapeHtml } from "@/lib/email";
import { jobThreads } from "@/lib/google/gmail";
import { linkedThreads } from "@/lib/inbox";
import { EmailDraftForm } from "../email-form";
import { InvoiceList, NewInvoice, type InvoiceListRow } from "../invoice-form";
import { invoiceStart } from "@/lib/invoice-start";
import { invoiceEmailStart } from "@/lib/invoice-email";
import { jobInvoices } from "@/lib/google/invoice-run";
import { invoiceLabel } from "@/lib/invoicing";
import { readLedger } from "@/lib/google/ledger-run";
import { mapsConfigured } from "@/lib/google/miles";
import { MilesButton } from "../miles-button";
import { DrawingCountPanel } from "../drawing-count";
import { listDrawingPdfs, type DrawingFile } from "@/lib/google/drawings-run";
import { countToItems, type SavedCount } from "@/lib/drawings";
import { assistantConfigured } from "@/lib/assistant/client";
import type { LedgerInvoice } from "@/lib/ledger";
import { draftLongQuote, draftShortQuote, isPriced, preparedByFor, productsFor, suggestLong } from "@/lib/quote-drafts";
import { getClient, getPersonByEmail, jobDocuments } from "@/lib/data";
import { JobForm } from "../job-form";
import { NoteForm, NotesText, PeopleControl, StageControl, Variations } from "../job-controls";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "money", label: "Quote & money" },
  { key: "visits", label: "Visits" },
  { key: "files", label: "Files" },
  { key: "email", label: "Email" },
  { key: "details", label: "Details" },
];

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const job = await findJob(decodeURIComponent(ref));
  return { title: job ? `${jobLabel(job)} ${job.client_name ?? ""}`.trim() : "Job" };
}

export default async function JobPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ tab?: string; numbered?: string; form?: string }> }) {
  const [{ ref }, { tab = "overview", numbered, form: formChoice }] = await Promise.all([params, searchParams]);
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
      <Link href="/jobs" className="mb-3 inline-flex h-9 items-center gap-1 text-[14px] font-medium text-muted hover:text-text">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Jobs
      </Link>

      {/* The job's header: number, client, where, stage and who, on one card. */}
      <div className="rounded-2xl border border-line bg-bg p-5 shadow-card md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="label">{job.type || "Job"}</p>
            <h1 className="headline mt-1.5 text-[22px] md:text-[28px]">
              <span className="text-blue-deep">{jobLabel(job)}</span> {job.client_name ?? "No client"}
            </h1>
            <p className="mt-1.5 text-[15px] text-muted">{where || "No site yet"}</p>
            {job.also.length > 0 && <p className="mt-1 text-[14px] text-muted">Also covers {job.also.map((n) => `#${n}`).join(", ")}</p>}
          </div>
          <StageControl jobId={job.id} stage={job.stage} />
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <PeopleControl jobId={job.id} selected={job.people} people={activePeople} />
        </div>
      </div>

      {numbered && job.number && (
        <p role="status" className="mt-4 rounded-xl border border-blue/25 bg-blue-soft px-4 py-3 text-[15px] font-medium">
          This job is now #{job.number}. Use that number on the quote, the Drive folder and wholesaler orders.
        </p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2 md:gap-4">
        <Stat label="Quote" value={m.income ? gbp(m.income, { whole: true }) : "–"} />
        <Stat label="Spent" value={gbp(m.spent, { whole: true })} />
        <Stat label="Profit" light={job.light} value={m.income ? gbp(m.profit, { whole: true }) : "–"} sub={m.margin !== null ? `${m.margin}% margin` : undefined} />
      </div>

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
                  className={`inline-flex h-11 items-center whitespace-nowrap border-b-2 px-3.5 text-[15px] ${
                    active ? "border-blue font-semibold text-text" : "border-transparent font-medium text-muted hover:text-text"
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
              <p className="whitespace-pre-line text-[16px]">{job.description || <span className="text-muted">No description yet.</span>}</p>
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
                  label={(() => {
                    const miles = job.pricing?.input.miles || job.miles_round_trip;
                    const vans = job.pricing ? Math.max(1, Number(job.pricing.input.vans) || 1) : 1;
                    if (!miles) return "Fuel and travel (miles not set yet)";
                    if (job.type === "Survey") return `Fuel and travel (${miles} miles for the whole survey trip × ${gbp(settings.rates.perMile)}, as quoted)`;
                    const perDay = Math.round(miles * vans * settings.rates.perMile * 100) / 100;
                    return `Fuel and travel (${gbp(perDay)} a day: ${miles} miles${vans > 1 ? ` × ${vans} vans` : ""} × ${gbp(settings.rates.perMile)}, as quoted; × ${m.visitDays} day${m.visitDays === 1 ? "" : "s"} on site)`;
                  })()}
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
            {job.type === "Survey" ? (
              <SurveyCard job={job} rates={settings.rates} />
            ) : (
              <>
                <PricingCard job={job} lines={detail.lines} redBelow={settings.margins.red} />
                <QuoteCard job={job} lines={detail.lines} templateChoice={formChoice} />
              </>
            )}
            <EmailQuoteCard job={job} />
            <InvoicesCard job={job} />
          </>
        )}

        {tab === "visits" && (
          <Card title="Visits">
            <JobVisits jobId={job.id} visits={detail.visits} people={people} today={todayUK()} />
            <p className="mt-4 text-[14px] text-muted">Booking a visit puts it in the shared calendar and invites whoever is going.</p>
          </Card>
        )}

        {tab === "files" && <FilesTab job={job} />}

        {tab === "email" && <EmailTab job={job} />}

        {tab === "details" && (
          <Card title="Miles">
            <MilesButton jobId={job.id} miles={job.miles_round_trip} ready={mapsConfigured()} />
            <p className="mt-3 text-[14px] text-muted">By road from 18 Alwin Close, Aylesbury, to the site&apos;s postcode and back, from Google Maps. Used for travel in pricing and for fuel in the job&apos;s profit. You can still type a figure in below.</p>
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
      <dt className="label">{label}</dt>
      <dd className="mt-1 text-[15px] font-medium">{value || "–"}</dd>
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

async function FilesTab({ job }: { job: { id: string; type: string; number: number | null; drive_folder_id: string; drive_folder_url: string; drive_error: string; links: { name: string; url: string }[] } }) {
  const me = await currentPerson();
  const connected = me ? await googleConnected(me.email) : false;
  let listing: FolderListing | null = null;
  let survey: SurveySummary | null = null;
  let problem = "";
  if (connected && job.drive_folder_id) {
    try {
      listing = await listJobFiles(me!.email, job.drive_folder_id);
      // Surveys sit in the job's own 09 - Surveys folder. Counted for survey jobs, and for any job that has something in it.
      const nine = listing.find((f) => /^09\b/.test(f.name.trim()));
      if (job.type === "Survey" || (nine && nine.files.length > 0)) survey = await surveySummary(me!.email, job.drive_folder_id);
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

        {listing && job.type === "Survey" && !survey && (
          <p className="rounded-xl bg-surface px-4 py-3 text-[15px]">This job&apos;s folder has no &quot;09 - Surveys&quot; folder yet. It&apos;s added the next time the job&apos;s stage changes, or make it in Drive.</p>
        )}
        {survey && (
          <div className="rounded-xl border border-line bg-bg p-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="label flex-1">Surveys</p>
              <a href={survey.url} target="_blank" rel="noreferrer" className={secondaryBtn}>
                <FolderOpen className="h-5 w-5 text-blue" aria-hidden="true" /> Open 09 - Surveys
              </a>
            </div>
            {survey.sites.length === 0 ? (
              <p className="mt-2 text-[15px] text-muted">Nothing in it yet. Add a folder per site, then a folder per unit (&quot;Unit – Tenant&quot;), then Electric, Gas and Water.</p>
            ) : (
              <>
                <p className="mt-2 text-[15px]">
                  <b>{survey.sites.length}</b> site{survey.sites.length === 1 ? "" : "s"}, <b>{survey.units}</b> unit{survey.units === 1 ? "" : "s"}, <b>{survey.meters}</b> meter{survey.meters === 1 ? "" : "s"}, <b>{survey.photos}</b> photo{survey.photos === 1 ? "" : "s"}.
                </p>
                <ul className="mt-2 divide-y divide-line">
                  {survey.sites.map((s) => (
                    <li key={s.url} className="flex flex-wrap items-center gap-3 py-2 text-[15px]">
                      <a href={s.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline">{s.name}</a>
                      <span className="text-[14px] text-muted">{s.units} unit{s.units === 1 ? "" : "s"} · {s.meters} meter{s.meters === 1 ? "" : "s"} · {s.photos} photo{s.photos === 1 ? "" : "s"}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

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
                    <ul className="mt-1 divide-y divide-line rounded-xl border border-line bg-bg">
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

async function PricingCard({ job, lines, redBelow }: { job: Awaited<ReturnType<typeof findJob>> & object; lines: Awaited<ReturnType<typeof jobDetail>>["lines"]; redBelow: number }) {
  const me = await currentPerson();
  const connected = me ? await googleConnected(me.email) : false;
  let products: Product[] = [];
  let listDate = "";
  let problem = "";
  if (connected) {
    try {
      const list = await loadPriceList(me!.email);
      products = list.products;
      listDate = ukDate(list.fetchedAt.slice(0, 10));
    } catch (e) {
      problem = errorText(e);
    }
  }
  const p = job.pricing;
  const light = p ? pricingLight(p.result, redBelow) : "none";
  // The job's drawings (PDFs in its Drive folder) and the latest count of them.
  let drawings: DrawingFile[] = [];
  if (connected && job.drive_folder_id) {
    try {
      drawings = await listDrawingPdfs(me!.email, job.drive_folder_id);
    } catch {
      drawings = [];
    }
  }
  const savedCount: SavedCount | null = job.drawing_count;
  const counted = savedCount && products.length ? countToItems(savedCount.count, products) : null;
  return (
    <>
      {p && (
        <Card title="Priced quote" action={<SheetLink url={p.sheetUrl} />}>
          <dl className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-surface p-3">
              <dt className="text-[13px] text-muted">Ex VAT</dt>
              <dd className="text-[20px] font-semibold tabular-nums">{gbp(p.result.sellExVat)}</dd>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <dt className="text-[13px] text-muted">Inc VAT</dt>
              <dd className="text-[20px] font-semibold tabular-nums">{gbp(p.result.sellIncVat)}</dd>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <dt className="flex items-center gap-1.5 text-[13px] text-muted">
                Margin <LightDot light={light} className="h-2.5 w-2.5" />
              </dt>
              <dd className="text-[20px] font-semibold tabular-nums">{p.result.netMargin}%</dd>
              <dd className="text-[13px] text-muted">target {p.result.targetMargin}%</dd>
            </div>
          </dl>
          <table className="mt-4 w-full text-left text-[15px]">
            <thead className="text-[13px] text-muted">
              <tr>
                <th className="py-2 font-medium">Item</th>
                <th className="py-2 text-right font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="py-2.5 pr-3">
                    {l.description}
                    {l.detail && <span className="block text-[14px] text-muted">{l.detail}</span>}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{l.kind === "item" ? l.qty : ""}</td>
                  <td className="py-2.5 text-right tabular-nums">{gbp(l.amount)}</td>
                </tr>
              ))}
              <tr className="border-t border-line font-semibold">
                <td className="py-2.5">Total ex VAT</td>
                <td />
                <td className="py-2.5 text-right tabular-nums">{gbp(p.result.sellExVat)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-[14px] text-muted">
            Priced by {p.by} on {ukDate(p.pricedAt.slice(0, 10))}
            {p.revision > 1 ? `, revision ${p.revision}` : ""}. The sheet expects {gbp(p.result.netProfit)} net profit from {p.result.labourHours.toFixed(1)} labour hours.
            {light !== "green" && " The margin is below target: check the sheet before quoting."}
          </p>
        </Card>
      )}
      {connected && job.drive_folder_id && (
        <Card title="Count the drawings">
          <DrawingCountPanel jobId={job.id} files={drawings} saved={savedCount} ready={assistantConfigured()} />
        </Card>
      )}
      <Card title={p ? "Change the pricing" : "Price this job"}>
        {!connected ? (
          <div className="rounded-xl bg-surface p-4">
            <p className="mb-3">Connect Google to price jobs with the pricing spreadsheet.</p>
            <ConnectGoogleButton className={secondaryBtn}>Connect Google</ConnectGoogleButton>
          </div>
        ) : problem ? (
          <p className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-[15px]">Couldn&apos;t read the price list. {problem}</p>
        ) : (
          <PricingForm jobId={job.id} products={products} listDate={listDate} saved={p?.input ?? null} miles={job.miles_round_trip} counted={counted} />
        )}
      </Card>
    </>
  );
}

async function QuoteCard({ job, lines, templateChoice }: { job: Awaited<ReturnType<typeof findJob>> & object; lines: Awaited<ReturnType<typeof jobDetail>>["lines"]; templateChoice?: string }) {
  const [docs, me, client] = await Promise.all([jobDocuments(job.id), currentPerson(), job.client_id ? getClient(job.client_id) : null]);
  const quotes = docs.filter((d) => d.kind === "quote");
  const preparedBy = me ? await preparedByFor(me.email) : null;

  let body: React.ReactNode;
  if (!isPriced(job)) {
    body = <p className="text-muted">Price the job first. The quote is built from the pricing.</p>;
  } else if (!preparedBy) {
    body = <p className="text-muted">Your email ({me?.email}) isn&apos;t on the People list in Settings, so the quote can&apos;t say who prepared it. Add it there first.</p>;
  } else {
    const start = draftShortQuote(job, lines, client, preparedBy);
    const wantLong = suggestLong(start.subtotal, job.type, client?.type ?? "");
    const form = (templateChoice === "long" || (templateChoice !== "short" && wantLong)) ? "long" : "short";
    const longStart = form === "long" ? draftLongQuote(job, lines, client, preparedBy, await productsFor(me!.email)) : null;
    const base = `/jobs/${job.number}?tab=money`;
    body = (
      <>
        <div className="mb-5 flex flex-wrap items-center gap-2 text-[15px]">
          <span className="text-muted">Template:</span>
          <a href={`${base}&form=short`} className={`rounded-full px-4 py-2 font-medium ${form === "short" ? "bg-blue text-blue-ink" : "bg-surface"}`}>Short form</a>
          <a href={`${base}&form=long`} className={`rounded-full px-4 py-2 font-medium ${form === "long" ? "bg-blue text-blue-ink" : "bg-surface"}`}>Long form</a>
          <span className="text-[14px] text-muted">{wantLong ? "Long form suggested: £2,000 or more, a tender or a main contractor." : "Short form suggested: a smaller job."}</span>
        </div>
        {form === "long" && longStart ? (
          <LongForm key={`L-${job.pricing.pricedAt}-${quotes.length}`} jobId={job.id} start={longStart} />
        ) : (
          <QuoteForm key={`S-${job.pricing.pricedAt}-${quotes.length}`} jobId={job.id} start={start} note="" />
        )}
      </>
    );
  }
  return (
    <Card title="Quote document">
      {quotes.length > 0 && (
        <ul className="mb-5 divide-y divide-line rounded-xl border border-line bg-bg">
          {quotes.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[15px]">
              <span className="min-w-0 flex-1">
                {job.number !== null && <span className="mr-2 rounded-md bg-surface px-2 py-0.5 text-[13px] font-semibold tabular-nums">{quoteRef(job.number, d.revision)}</span>}
                <span className="font-medium">{d.name}</span>
                <span className="block text-[14px] text-muted">
                  {ukDate(d.created_at.slice(0, 10))}
                  {d.pages ? ` · ${d.pages} pages` : ""}
                  {d.note ? ` · ${d.note}` : ""}
                </span>
              </span>
              {d.pdf_url && <a href={d.pdf_url} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">PDF</a>}
              <a href={d.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">Doc</a>
            </li>
          ))}
        </ul>
      )}
      {body}
    </Card>
  );
}

async function SurveyCard({ job, rates }: { job: Awaited<ReturnType<typeof findJob>> & object; rates: { surveyDay: number; perMile: number } }) {
  const [docs, me, client] = await Promise.all([jobDocuments(job.id), currentPerson(), job.client_id ? getClient(job.client_id) : null]);
  const person = me ? await getPersonByEmail(me.email) : null;
  const connected = me ? me.email === "preview@localhost" || (await googleConnected(me.email)) : false;
  const preparedBy = person
    ? { name: person.full_name, title: person.role, email: person.email }
    : me?.email === "preview@localhost"
      ? { name: "Callum Blacknell", title: "Project Manager", email: "callum@battelectrical.com" }
      : null;
  const today = todayUK();
  const uk = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const d = job.quote_draft as unknown as (Record<string, unknown> & { template?: string }) | null;
  const last = d?.template === "surveyProposal" ? (d as unknown as import("@/lib/quote-survey").SurveyQuote) : null;
  const proposals = docs.filter((x) => x.kind === "quote");
  return (
    <Card title="Survey proposal">
      {proposals.length > 0 && (
        <ul className="mb-5 divide-y divide-line rounded-xl border border-line bg-bg">
          {proposals.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[15px]">
              <span className="min-w-0 flex-1">
                {job.number !== null && <span className="mr-2 rounded-md bg-surface px-2 py-0.5 text-[13px] font-semibold tabular-nums">{quoteRef(job.number, x.revision)}</span>}
                <span className="font-medium">{x.name}</span>
                <span className="block text-[14px] text-muted">{ukDate(x.created_at.slice(0, 10))}{x.pages ? ` · ${x.pages} pages` : ""}{x.note ? ` · ${x.note}` : ""}</span>
              </span>
              {x.pdf_url && <a href={x.pdf_url} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">PDF</a>}
              <a href={x.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">Doc</a>
            </li>
          ))}
        </ul>
      )}
      {!connected ? (
        <div className="rounded-xl bg-surface p-4">
          <p className="mb-3">Connect Google to make survey proposals.</p>
          <ConnectGoogleButton className={secondaryBtn}>Connect Google</ConnectGoogleButton>
        </div>
      ) : !preparedBy ? (
        <p className="text-muted">Your email ({me?.email}) isn&apos;t on the People list in Settings, so the proposal can&apos;t say who prepared it. Add it there first.</p>
      ) : (
        <SurveyForm
          key={proposals.length}
          jobId={job.id}
          dayRate={rates.surveyDay}
          perMile={rates.perMile}
          start={{
            siteName: last?.siteName ?? job.site,
            siteAddress: last?.siteAddress ?? [job.site, job.postcode].filter(Boolean).join(", "),
            summary: last?.summary ?? job.description,
            sites: last?.sites ?? [{ name: job.site, address: "", postcode: job.postcode, units: [{ name: "", area: "", scope: "Electric, gas and water" }] }],
            days: last?.days ?? 1,
            miles: job.miles_round_trip ?? NaN,
            route: "",
            weekend: false,
            paymentDays: last?.paymentDays ?? client?.payment_days ?? 7,
            date: uk(today),
            validUntil: uk(plusDays(today, 30)),
            preparedBy,
          }}
        />
      )}
    </Card>
  );
}

async function EmailQuoteCard({ job }: { job: Awaited<ReturnType<typeof findJob>> & object }) {
  const me = await currentPerson();
  if (!me || me.email === "preview@localhost") return null;
  const start = await quoteEmailStart(job, me.email);
  if (!start) return null;
  const ok = await gmailConnected(me.email);
  return (
    <Card title="Email the quote">
      {ok ? (
        <EmailDraftForm jobId={job.id} start={start} />
      ) : (
        <div className="rounded-xl bg-surface p-4">
          <p className="mb-3">To draft the email in Gmail, connect Google again and tick the Gmail boxes. The app only ever saves drafts; it never sends.</p>
          <ConnectGoogleButton className={secondaryBtn}>Connect Google</ConnectGoogleButton>
        </div>
      )}
    </Card>
  );
}

async function EmailTab({ job }: { job: Awaited<ReturnType<typeof findJob>> & object }) {
  const me = await currentPerson();
  const ok = me && me.email !== "preview@localhost" ? await gmailConnected(me.email) : false;
  const client = job.client_id ? await getClient(job.client_id) : null;
  const query = jobSearch({ number: job.number, legacy_ref: job.legacy_ref, clientEmail: client?.email || findEmail(job.contact) });
  const linked = await linkedThreads(job.id);
  let result: Awaited<ReturnType<typeof jobThreads>> | null = null;
  let problem = "";
  if (ok && (query || linked.length)) {
    try {
      result = await jobThreads(query, me!.email, linked);
    } catch (e) {
      problem = errorText(e);
    }
  }
  const people = await getPeople(true);
  const whose = (box: string) => people.find((p) => p.email.toLowerCase() === box)?.short_name ?? box;
  return (
    <Card title="Email">
      {!ok ? (
        <div className="rounded-xl bg-surface p-4">
          <p className="mb-3">Connect Google again and tick the Gmail boxes to see this job&apos;s emails here.</p>
          <ConnectGoogleButton className={secondaryBtn}>Connect Google</ConnectGoogleButton>
        </div>
      ) : !query && linked.length === 0 ? (
        <p className="text-muted">This job has no number or client email yet, so there&apos;s nothing to search for. Emails linked from the Inbox will show here.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-[14px] text-muted">
            Emails linked from the Inbox{job.number || job.legacy_ref ? `, and those with ${job.number ?? job.legacy_ref} in the subject` : ""}{client?.email ? `, or to or from ${client.email}` : ""}, from the last two years, in everyone&apos;s mailbox that&apos;s connected.
          </p>
          {problem && <p className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-[15px]">{problem}</p>}
          {result?.problems.map((p) => (
            <p key={p} className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-[15px]">Couldn&apos;t search {p}</p>
          ))}
          {result && result.threads.length === 0 && <p className="text-muted">No emails found.</p>}
          {result && result.threads.length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line bg-bg">
              {result.threads.map((t) => (
                <li key={t.mailbox + t.threadId} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    {t.url ? (
                      <a href={t.url} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">{t.subject}</a>
                    ) : (
                      <span className="font-medium">{t.subject}</span>
                    )}
                    {t.count > 1 && <span className="text-[14px] text-muted">{t.count} emails</span>}
                    <span className="ml-auto text-[14px] text-muted">{t.date ? ukDate(t.date.slice(0, 10)) : ""}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[15px] text-muted">
                    <span className="text-text">{t.from}</span> · {unescapeHtml(t.snippet)}
                  </p>
                  <p className="mt-1 text-[13px] text-muted">In {whose(t.mailbox)}&apos;s mailbox</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

async function InvoicesCard({ job }: { job: Awaited<ReturnType<typeof findJob>> & object }) {
  const me = await currentPerson();
  if (!me || me.email === "preview@localhost") return null;
  const connected = await googleConnected(me.email);
  const list = await jobInvoices(job.id);
  // Invoices raised by hand are in the ledger but not in the app: show them, and count them as invoiced.
  let byHand: LedgerInvoice[] = [];
  let ledgerProblem = "";
  if (connected && job.number) {
    try {
      const ledger = await readLedger(me.email);
      const mine = new Set(list.map((i) => invoiceLabel(i.number, i.test)));
      byHand = ledger.invoices.filter((i) => i.jobNumber === job.number && !mine.has(i.number));
    } catch (e) {
      ledgerProblem = errorText(e);
    }
  }
  const start = await invoiceStart(job, byHand.filter((h) => h.net !== null).map((h) => ({ number: h.number, type: h.type, net: h.net! })));
  const rows: InvoiceListRow[] = await Promise.all(
    list.filter((i) => i.test === start.test).map(async (i) => ({
      ...i,
      label: invoiceLabel(i.number, i.test),
      email: ["made", "sent"].includes(i.status) ? await invoiceEmailStart(i.id, me.email) : null,
    })),
  );
  return (
    <Card title="Invoices">
      <div className="space-y-6">
        {rows.length > 0 && <InvoiceList items={rows} today={start.today} />}
        {byHand.length > 0 && (
          <div>
            <p className="label mb-2">Raised by hand (from the ledger)</p>
            <ul className="divide-y divide-line rounded-xl border border-line bg-bg">
              {byHand.map((h) => (
                <li key={h.number} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[15px]">
                  <span className="font-semibold">{h.number}</span>
                  <span>{h.type}</span>
                  <span className="tabular-nums">{h.gross === null ? "" : gbp(h.gross)}</span>
                  <span className="rounded-full bg-surface px-3 py-1 text-[13px] font-medium">{h.status === "Draft" ? "Not marked sent" : h.status}</span>
                  <span className="ml-auto flex gap-3">
                    {h.pdfUrl && <a href={h.pdfUrl} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">PDF</a>}
                    <Link href="/invoices" className="underline underline-offset-4">Mark sent or paid</Link>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {ledgerProblem && <p className="text-[14px] text-muted">Couldn&apos;t check the ledger for invoices raised by hand: {ledgerProblem}</p>}
        {!connected ? (
          <div className="rounded-xl bg-surface p-4">
            <p className="mb-3">Connect Google to make invoices.</p>
            <ConnectGoogleButton className={secondaryBtn}>Connect Google</ConnectGoogleButton>
          </div>
        ) : !job.client_id ? (
          <p className="text-muted">Add the client on the Details tab before invoicing.</p>
        ) : (
          <details className="group rounded-xl border border-line bg-bg" open={rows.length === 0 && byHand.length === 0}>
            <summary className="cursor-pointer list-none px-4 py-3 font-semibold">Raise an invoice</summary>
            <div className="border-t border-line p-4">
              <NewInvoice jobId={job.id} start={start} />
            </div>
          </details>
        )}
      </div>
    </Card>
  );
}
