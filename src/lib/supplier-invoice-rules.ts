/** When a supplier invoice can go on a job by itself, and when a person must check it. Pure, tested. */

export type InvoiceReading = {
  is_invoice_or_credit_note: boolean;
  is_credit_note: boolean;
  addressed_to_batt: boolean;
  supplier: string;
  invoice_number: string;
  invoice_date: string; // YYYY-MM-DD or ""
  net: number | null;
  vat: number | null;
  gross: number | null;
  order_reference: string;
  job_numbers: number[];
  /** Where the goods were delivered or what site they were for, as printed. Empty if collected or not shown. */
  delivery_address?: string;
};

/** A job's address, for matching an invoice to it when there's no job number on the invoice. */
export type JobSite = { number: number; site: string; postcode: string; open: boolean };

export type Decision =
  | { status: "filed"; jobNumber: number; amount: number; reason: string }
  | { status: "check" | "ignored"; jobNumber: number | null; amount: number | null; reason: string; /** Jobs it might be for, from the address. */ suggest?: number[] };

/** Job numbers in an order reference like "#552 CBRE CROYDEN" or "PO 557/558". */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(/(?<![\d.£,])#?\s?(\d{3,4})(?![\d.,]\d)/g)].map((m) => Number(m[1]));
}

const close = (a: number, b: number) => Math.abs(a - b) <= 0.02;

/** Batt's own address: goods delivered to the office say nothing about which job they're for. */
const OWN_POSTCODE = "HP218RP";
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/gi;
const SUFFIX: Record<string, string> = { st: "street", rd: "road", ln: "lane", cl: "close", ave: "avenue", av: "avenue", dr: "drive", ct: "court", pl: "place", gdns: "gardens", cres: "crescent", sq: "square" };
const STREET_WORDS = "street|road|lane|close|avenue|drive|way|court|place|gardens|crescent|grove|park|square|row|hill|walk|terrace|mews|house|estate|centre|center";
const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).map((w) => SUFFIX[w] ?? w).join(" ");
export const postcodesIn = (s: string) => [...s.toUpperCase().matchAll(POSTCODE)].map((m) => m[1] + m[2]).filter((p) => p !== OWN_POSTCODE);

/** "19 back street", "31b church lane": a house number and its street, tidied. */
function numberedStreets(s: string): string[] {
  return [...plain(s).matchAll(new RegExp(`\\b(\\d+[a-z]?) ((?:[a-z]+ ){0,3}(?:${STREET_WORDS}))\\b`, "g"))].map((m) => `${m[1]} ${m[2]}`);
}

/** Names worth matching without a number: "back street", "oaken grove", "brook house", "bell court". At least two words. */
function placeNames(s: string): string[] {
  return [...new Set([...plain(s).matchAll(new RegExp(`\\b((?:[a-z]{3,} ){1,2}(?:${STREET_WORDS}))\\b`, "g"))].map((m) => m[1]))];
}

/**
 * Which jobs an address on an invoice points at. Sure: the same postcode, or the same house number and street.
 * Rough: only the street or the place name matches ("Back Street", "Oaken Grove"). Open jobs are preferred:
 * a finished job only counts if no open job matches.
 */
export function matchByAddress(text: string, jobs: JobSite[]): { sure: number[]; rough: number[] } {
  const t = plain(text);
  if (!t) return { sure: [], rough: [] };
  const posts = new Set(postcodesIn(text));
  const streets = new Set(numberedStreets(text));
  const sure: JobSite[] = [];
  const rough: JobSite[] = [];
  for (const j of jobs) {
    const where = `${j.site} ${j.postcode}`;
    if (postcodesIn(where).some((p) => posts.has(p)) || numberedStreets(where).some((s) => streets.has(s))) sure.push(j);
    else if (placeNames(j.site).some((n) => new RegExp(`\\b${n}\\b`).test(t))) rough.push(j);
  }
  const prefer = (list: JobSite[]) => [...new Set((list.some((j) => j.open) ? list.filter((j) => j.open) : list).map((j) => j.number))];
  return { sure: prefer(sure), rough: sure.length ? [] : prefer(rough) };
}

/**
 * `jobs` maps every known job number (including numbers merged into a job) to the job's own number.
 * `alreadyFiled` is true when the same supplier's invoice number is already on a job.
 */
export function decide(r: InvoiceReading, jobs: Map<number, number>, alreadyFiled: boolean, sites: JobSite[] = []): Decision {
  const none = { jobNumber: null, amount: null };
  if (!r.is_invoice_or_credit_note) return { status: "ignored", ...none, reason: "Not an invoice or credit note (a quote, statement or order confirmation)." };
  if (alreadyFiled) return { status: "ignored", ...none, reason: `${r.supplier} ${r.invoice_number} is already on a job.` };
  if (!r.addressed_to_batt) return { status: "check", ...none, reason: "It isn't clearly made out to Batt Electrical." };
  if (r.net === null || r.vat === null || r.gross === null) return { status: "check", ...none, reason: "Couldn't read the net, VAT and total." };
  if (!close(r.net + r.vat, r.gross)) return { status: "check", ...none, reason: `Net £${r.net.toFixed(2)} + VAT £${r.vat.toFixed(2)} doesn't equal the total £${r.gross.toFixed(2)}.` };
  const amount = Math.round((r.is_credit_note ? -Math.abs(r.net) : r.net) * 100) / 100;
  const found = [...new Set([...r.job_numbers, ...numbersIn(r.order_reference)].map((n) => jobs.get(n)).filter((n): n is number => n !== undefined))];
  if (found.length === 0) {
    // No job number: go by where it was delivered, or a site named in the order reference.
    const where = [r.delivery_address ?? "", r.order_reference].join(" , ");
    const m = matchByAddress(where, sites);
    const shown = (r.delivery_address || r.order_reference).replace(/\s+/g, " ").trim().slice(0, 90);
    if (m.sure.length === 1) return { status: "filed", jobNumber: m.sure[0], amount, reason: `No job number on it, but the address matches job #${m.sure[0]} ("${shown}").` };
    const maybe = m.sure.length > 1 ? m.sure : m.rough;
    if (maybe.length) {
      const list = maybe.map((n) => `#${n}`).join(", ");
      return { status: "check", jobNumber: null, amount, suggest: maybe, reason: m.sure.length > 1 ? `No job number on it, and the address ("${shown}") fits more than one job: ${list}.` : `No job number on it. The address ("${shown}") looks like ${maybe.length === 1 ? `job ${list}` : `one of ${list}`}, but it isn't a sure match.` };
    }
    return { status: "check", jobNumber: null, amount, reason: r.order_reference ? `No job number found in the order reference "${r.order_reference}", and the address doesn't match a job.` : "No job number on it, and the address doesn't match a job." };
  }
  if (found.length > 1) return { status: "check", jobNumber: null, amount, reason: `More than one job on it: ${found.map((n) => `#${n}`).join(", ")}.` };
  return { status: "filed", jobNumber: found[0], amount, reason: `Order reference "${r.order_reference || found[0]}".` };
}
