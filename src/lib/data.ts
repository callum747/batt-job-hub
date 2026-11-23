import "server-only";
import { sql } from "./db";
import { jobMoney, marginLight, type Light, type MoneyResult } from "./money";
import { parseJobNumber, todayUK, type Stage } from "./jobs-rules";

export type Margins = { green: number; red: number };
export type Rates = {
  electricianDay: number;
  apprenticeDay: number;
  dayRate: number;
  apprenticeDayRate: number;
  surveyDay: number;
  perMile: number;
  markupPct: number;
  vatPct: number;
};

export type PersonRow = {
  id: string;
  short_name: string;
  full_name: string;
  email: string;
  role: string;
  day_cost: number;
  colour: string;
  active: boolean;
};

export type JobRow = {
  id: string;
  number: number | null;
  legacy_ref: string;
  also: number[];
  merged_into: string | null;
  stage: Stage;
  client_id: string | null;
  client_name: string | null;
  site: string;
  postcode: string;
  type: string;
  description: string;
  contact: string;
  miles_round_trip: number | null;
  quote_value: number;
  received: string | null;
  deadline: string | null;
  quoted_at: string | null;
  outcome_at: string | null;
  outcome_reason: string;
  start_date: string | null;
  end_date: string | null;
  certs: string;
  building_control: string;
  drive_folder_id: string;
  drive_folder_url: string;
  drive_error: string;
  pricing: import("./google/pricing-run").SavedPricing | null;
  quote_draft: import("./quote-short").ShortQuote | null;
  links: { name: string; url: string }[];
  notes: string;
  updated_at: string;
  people: string[]; // person ids
};

export type JobWithMoney = JobRow & { money: MoneyResult; light: Light };

export type VisitRow = {
  id: string;
  job_id: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  work: string;
  site: string;
  confirmed: boolean;
  calendar_link: string;
  calendar_error: string;
  notes: string;
  people: string[];
};

export type VariationRow = { id: string; job_id: string; description: string; amount: number; approved: boolean; date: string | null };
export type LineRow = { id: string; kind: string; description: string; detail: string; qty: number; rate: number; cost: number; amount: number };
export type CostRow = { id: string; job_id: string; kind: string; description: string; amount: number; date: string | null; file_url: string };

export type ClientRow = {
  id: string;
  name: string;
  type: string;
  contact: string;
  email: string;
  phone: string;
  billing_address: string;
  payment_days: number | null;
  notes: string;
};

export async function getSettings() {
  const rows = await sql<{ key: string; value: unknown }[]>`select key, value from settings`;
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    margins: { green: 18, red: 5, ...(map.margins as Partial<Margins>) } as Margins,
    rates: map.rates as Rates,
  };
}

export async function getPeople(includeInactive = false) {
  const rows = plain(await sql<PersonRow[]>`select id, short_name, full_name, email, role, day_cost, colour, active from people order by position, short_name`);
  return includeInactive ? rows : rows.filter((p) => p.active);
}

/** Query results as ordinary arrays, safe to hand to the screens. */
const plain = <T,>(rows: readonly T[]): T[] => rows.map((r) => ({ ...r }));

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

async function loadJobs(where: ReturnType<typeof sql> | null) {
  const rows = await sql<JobRow[]>`
    select j.*, j.updated_at::text as updated_at, c.name as client_name,
      coalesce((select array_agg(jp.person_id) from job_people jp where jp.job_id = j.id), '{}') as people
    from jobs j left join clients c on c.id = j.client_id
    ${where ? sql`where ${where}` : sql``}
    order by (j.number is null and j.legacy_ref = '') desc, j.number desc nulls last,
      j.legacy_ref like 'H-%', j.legacy_ref desc, j.received desc nulls last, j.created_at desc`;
  return plain(rows);
}

/**
 * What's been invoiced counts as the income once the job is fully invoiced (Invoiced, Paid or Closed), or once the
 * invoices reach the quote plus approved extras. Before that a deposit alone would make the job look like a loss,
 * so the quote is used instead.
 */
function invoicedIncome(j: JobRow, variations: { amount: number }[], invoices: { net: number }[], earns: boolean): number | null {
  if (!earns || invoices.length === 0) return null;
  const invoiced = invoices.reduce((s, i) => s + Number(i.net), 0);
  const expected = Number(j.quote_value) + variations.reduce((s, v) => s + Number(v.amount), 0);
  return ["Invoiced", "Paid", "Closed"].includes(j.stage) || invoiced >= expected - 0.005 ? invoiced : null;
}

/** Works out money for a set of jobs in a handful of queries. */
async function withMoney(jobs: JobRow[]): Promise<JobWithMoney[]> {
  if (jobs.length === 0) return [];
  const ids = jobs.map((j) => j.id);
  const [settings, people, visits, costs, variations, invoiced] = await Promise.all([
    getSettings(),
    getPeople(true),
    sql<{ job_id: string; date: string; start_time: string | null; end_time: string | null; people: string[] }[]>`
      select v.job_id, v.date, v.start_time::text, v.end_time::text,
        coalesce((select array_agg(vp.person_id) from visit_people vp where vp.visit_id = v.id), '{}') as people
      from visits v where v.job_id = any(${ids})`,
    sql<{ job_id: string; amount: number }[]>`select job_id, amount from costs where job_id = any(${ids})`,
    sql<{ job_id: string; amount: number }[]>`select job_id, amount from variations where approved and job_id = any(${ids})`,
    // Real invoices only: test-mode invoices never change a job's figures.
    sql<{ job_id: string; net: number }[]>`select job_id, net from invoices where not test and status in ('made', 'sent', 'paid') and job_id = any(${ids})`,
  ]);
  const dayCost = new Map(people.map((p) => [p.id, Number(p.day_cost)]));
  const today = todayUK();
  const group = <T extends { job_id: string | null }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) if (r.job_id) m.set(r.job_id, [...(m.get(r.job_id) ?? []), r]);
    return m;
  };
  const vByJob = group(visits);
  const cByJob = group(costs);
  const varByJob = group(variations);
  const invByJob = group(invoiced);

  return jobs.map((j) => {
    // A lost job earns nothing, so it shows no income or profit (its quote stays on the job).
    const earns = j.stage !== "Lost";
    const money = jobMoney({
      quoteValue: earns ? j.quote_value : 0,
      approvedVariations: earns ? (varByJob.get(j.id) ?? []).map((v) => v.amount) : [],
      invoicedNet: invoicedIncome(j, varByJob.get(j.id) ?? [], invByJob.get(j.id) ?? [], earns),
      visits: (vByJob.get(j.id) ?? []).map((v) => ({
        date: v.date,
        start: hhmm(v.start_time),
        end: hhmm(v.end_time),
        dayCosts: v.people.map((p) => dayCost.get(p) ?? 0),
      })),
      // Fuel per day as the quote worked it out: its miles and vans. The job's own miles are used if it hasn't been priced.
      milesRoundTrip: j.pricing?.input.miles || j.miles_round_trip,
      vans: j.pricing ? Math.max(1, Number(j.pricing.input.vans) || 1) : 1,
      milesForWholeTrip: j.type === "Survey",
      perMile: settings.rates?.perMile ?? 0.45,
      costs: (cByJob.get(j.id) ?? []).map((c) => c.amount),
      today,
    });
    return { ...j, money, light: marginLight(money.margin, settings.margins) };
  });
}

/** Every job that hasn't been merged into another. */
export async function listJobs() {
  return withMoney(await loadJobs(sql`j.merged_into is null`));
}

export async function listJobsForClient(clientId: string) {
  return withMoney(await loadJobs(sql`j.merged_into is null and j.client_id = ${clientId}`));
}

/** Finds a job by its number (also numbers merged into it, and old Q- refs) or by its id. */
export async function findJob(ref: string) {
  const n = parseJobNumber(ref);
  let rows: JobRow[];
  if (n !== null) {
    rows = await loadJobs(sql`j.number = ${n} or ${n} = any(j.also)`);
  } else if (/^[0-9a-f-]{36}$/i.test(ref)) {
    rows = await loadJobs(sql`j.id = ${ref}`);
  } else {
    rows = await loadJobs(sql`j.legacy_ref = ${ref}`);
  }
  if (rows.length === 0) return null;
  // A merged job sends you to the job it was merged into.
  const job = rows.find((r) => !r.merged_into) ?? rows[0];
  if (job.merged_into) return findJob(job.merged_into);
  const [withM] = await withMoney([job]);
  return withM;
}

export async function jobDetail(jobId: string) {
  const [visits, variations, costs, lines] = await Promise.all([
    sql<VisitRow[]>`
      select v.id, v.job_id, v.date, v.start_time::text, v.end_time::text, v.work, v.site, v.confirmed, v.calendar_link, v.calendar_error, v.notes,
        coalesce((select array_agg(vp.person_id) from visit_people vp where vp.visit_id = v.id), '{}') as people
      from visits v where v.job_id = ${jobId} order by v.date, v.start_time nulls first`,
    sql<VariationRow[]>`select id, job_id, description, amount, approved, date from variations where job_id = ${jobId} order by created_at`,
    sql<CostRow[]>`select id, job_id, kind::text, description, amount, date, file_url from costs where job_id = ${jobId} order by date nulls last, created_at`,
    sql<LineRow[]>`select id, kind, description, detail, qty, rate, cost, amount from quote_lines where job_id = ${jobId} order by position`,
  ]);
  return { visits: plain(visits), variations: plain(variations), costs: plain(costs), lines: plain(lines) };
}

export async function listClients() {
  return plain(await sql<(ClientRow & { jobs: number; open_jobs: number; won_value: number })[]>`
    select c.*, count(j.id)::int as jobs,
      count(j.id) filter (where j.stage in ('Enquiry','Draft quote','Quoted','Booked','In progress','Complete','Invoiced','On hold'))::int as open_jobs,
      coalesce(sum(j.quote_value) filter (where j.stage in ('Booked','In progress','Complete','Invoiced','Paid')), 0) as won_value
    from clients c left join jobs j on j.client_id = c.id and j.merged_into is null
    group by c.id order by c.name`);
}

export async function getClient(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [c] = await sql<ClientRow[]>`select * from clients where id = ${id}`;
  return c ? { ...c } : null;
}

export type DiaryVisit = VisitRow & { job_number: number | null; job_ref: string; client_name: string | null; job_site: string | null };

export async function listVisits(from: string, to: string): Promise<DiaryVisit[]> {
  return plain(await sql<DiaryVisit[]>`
    select v.id, v.job_id, v.date, v.start_time::text, v.end_time::text, v.work, v.site, v.confirmed, v.calendar_link, v.calendar_error, v.notes,
      coalesce((select array_agg(vp.person_id) from visit_people vp where vp.visit_id = v.id), '{}') as people,
      j.number as job_number, coalesce(j.legacy_ref, '') as job_ref, c.name as client_name, j.site as job_site
    from visits v left join jobs j on j.id = v.job_id left join clients c on c.id = j.client_id
    where v.date between ${from} and ${to}
    order by v.date, v.start_time nulls first`);
}

export async function searchEverything(q: string) {
  const text = q.trim();
  if (!text) return { jobs: [], clients: [] };
  const n = parseJobNumber(text);
  const like = `%${text.replace(/[%_\\]/g, (m) => "\\" + m)}%`;
  const jobRows = await loadJobs(sql`j.merged_into is null and (
      ${n !== null ? sql`j.number = ${n} or ${n} = any(j.also) or` : sql``}
      j.legacy_ref ilike ${like} or j.site ilike ${like} or j.postcode ilike ${like} or j.description ilike ${like}
      or j.contact ilike ${like} or j.notes ilike ${like} or c.name ilike ${like})`);
  const clients = await sql<ClientRow[]>`
    select * from clients where name ilike ${like} or contact ilike ${like} or email ilike ${like} or notes ilike ${like} order by name limit 20`;
  return { jobs: await withMoney(jobRows.slice(0, 50)), clients: plain(clients) };
}

export type DocumentRow = { id: string; kind: string; revision: number; name: string; url: string; pdf_url: string; pages: number | null; note: string; created_by: string; created_at: string };

export async function jobDocuments(jobId: string) {
  return plain(await sql<DocumentRow[]>`
    select id, kind, revision, name, url, pdf_url, pages, note, created_by, created_at::text from documents where job_id = ${jobId} order by created_at desc`);
}

export async function getPersonByEmail(email: string) {
  const [p] = await sql<PersonRow[]>`select id, short_name, full_name, email, role, day_cost, colour, active from people where lower(email) = lower(${email})`;
  return p ? { ...p } : null;
}
