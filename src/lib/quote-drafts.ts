import "server-only";
/** First drafts of a job's quote, shared by the job page and the assistant, so both build quotes the same way. */
import { getClient, getPersonByEmail, type ClientRow, type JobRow, type LineRow } from "./data";
import { todayUK } from "./jobs-rules";
import { loadPriceList } from "./google/pricing-run";
import { defaultLongQuote, defaultShortQuote } from "./quote-defaults";
import type { LongQuote } from "./quote-long";
import type { ShortQuote } from "./quote-short";
import type { Product } from "./pricing";

export type PreparedBy = { name: string; title: string; email: string };

const PREVIEW = "preview@localhost";

/** Who the quote says prepared it: the signed-in person from the People list. Null if they aren't on it. */
export async function preparedByFor(email: string): Promise<PreparedBy | null> {
  if (email === PREVIEW) return { name: "Callum Blacknell", title: "Project Manager", email: "callum@battelectrical.com" };
  const p = await getPersonByEmail(email);
  return p ? { name: p.full_name, title: p.role, email: p.email } : null;
}

/** Long form for £2,000 and over, tenders and main contractors; short form otherwise. */
export function suggestLong(subtotal: number, jobType: string, clientType: string) {
  return subtotal >= 2000 || jobType === "Tender" || /contractor/i.test(clientType);
}

type Priced = JobRow & { number: number; pricing: NonNullable<JobRow["pricing"]> };

export function isPriced(job: JobRow): job is Priced {
  return Boolean(job.pricing && job.number);
}

function clientFor(c: ClientRow | null) {
  return c ? { name: c.name, notes: c.notes, payment_days: c.payment_days } : null;
}

export async function loadClient(job: JobRow) {
  return job.client_id ? getClient(job.client_id) : null;
}

/** Short-form draft: numbers and dates fresh from the pricing, wording kept from the last short quote. */
export function draftShortQuote(job: Priced, lines: LineRow[], client: ClientRow | null, preparedBy: PreparedBy): ShortQuote {
  const fromPricing = defaultShortQuote({
    number: job.number,
    client: clientFor(client),
    site: job.site,
    postcode: job.postcode,
    description: job.description,
    pricing: job.pricing.input,
    lines,
    subtotal: job.pricing.result.sellExVat,
    preparedBy,
    today: todayUK(),
  });
  // Priced straight from lines: the schedule of works is the one written with the pricing.
  if (job.pricing.direct) fromPricing.schedule = job.pricing.direct.schedule;
  const d = (job.quote_draft as unknown as { template?: string } | null)?.template === "quoteShort" && !job.pricing.direct ? job.quote_draft : null;
  return d
    ? { ...fromPricing, project: d.project, site: d.site, summary: d.summary, installation: d.installation, schedule: d.schedule, deposit: d.deposit, paymentDays: d.paymentDays, exclusions: d.exclusions, assumptions: d.assumptions }
    : fromPricing;
}

/** Long-form draft: numbers fresh from the pricing, wording kept from the last long quote. */
export function draftLongQuote(job: Priced, lines: LineRow[], client: ClientRow | null, preparedBy: PreparedBy, products: Product[]): LongQuote {
  const sectionOf = (key: string) => products.find((p) => p.key === key)?.section ?? null;
  const start = defaultLongQuote({
    number: job.number,
    client: clientFor(client),
    site: job.site,
    postcode: job.postcode,
    description: job.description,
    pricing: job.pricing.input,
    lines,
    subtotal: job.pricing.result.sellExVat,
    preparedBy,
    today: todayUK(),
    sectionOf,
    clientType: client?.type ?? "",
  });
  if (job.pricing.direct) {
    const items = job.pricing.direct.schedule.flatMap((g) => g.items);
    return { ...start, scope: items.map((i) => ({ item: i.item, qty: i.ref || "1" })), programme: job.pricing.direct.schedule.map((g) => ({ area: g.area, works: g.items.map((i) => i.works).join("; ") })) };
  }
  const last = job.quote_draft as unknown as (LongQuote & { template?: string }) | null;
  if (last?.template !== "quoteLong") return start;
  return {
    ...start,
    project: last.project, site: last.site, summary: last.summary, installation: last.installation, scope: last.scope,
    paymentDays: last.paymentDays, extras: last.extras, programme: last.programme, exclusions: last.exclusions,
    assumptions: last.assumptions, rooms: last.rooms, fittings: last.fittings,
  };
}

/** The price list, or an empty list if it can't be read (the long form then groups everything as "Other works"). */
export async function productsFor(email: string): Promise<Product[]> {
  if (email === PREVIEW) return [];
  try {
    return (await loadPriceList(email)).products;
  } catch {
    return [];
  }
}
