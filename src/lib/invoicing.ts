/**
 * Batt's own invoices: what each stage is worth, VAT or CIS, numbering and dates. Pure and tested,
 * following the finance rules (playbook finance--invoicing.md). Money is worked in pence.
 */

export const INVOICE_TYPES = ["Deposit", "Stage payment", "Final", "Survey", "Day rate", "Variation", "Other"] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];
export type VatTreatment = "Standard 20%" | "Reverse charge";

export type Stage = { label: string; pct: number };

type SavedQuote = { template?: string; deposit?: boolean } | null;

/** The payment table printed on the job's quote: the invoices follow it. */
export function paymentStages(q: SavedQuote): Stage[] | null {
  if (!q?.template) return null;
  if (q.template === "quoteShort")
    return q.deposit === false ? [{ label: "On completion", pct: 100 }] : [{ label: "Deposit, on acceptance", pct: 20 }, { label: "On completion", pct: 80 }];
  if (q.template === "quoteLong")
    return [
      { label: "Deposit, on acceptance", pct: 25 },
      { label: "Completion of first fix", pct: 35 },
      { label: "Completion of second fix", pct: 30 },
      { label: "Testing, certification and handover", pct: 10 },
    ];
  if (q.template === "surveyProposal") return [{ label: "On completion of the survey", pct: 100 }];
  return null;
}

const pence = (pounds: number) => Math.round(pounds * 100);
const pounds = (p: number) => p / 100;

/** A stage's amount ex VAT: its share of the quote, to the penny. */
export function stageAmount(quoteNet: number, pct: number) {
  return pounds(Math.round((pence(quoteNet) * pct) / 100));
}

/** The final invoice: quote + approved variations − everything already invoiced on the job (ex VAT). */
export function finalAmount(quoteNet: number, approvedVariations: number[], alreadyInvoiced: number[]) {
  return pounds(pence(quoteNet) + approvedVariations.reduce((s, v) => s + pence(v), 0) - alreadyInvoiced.reduce((s, v) => s + pence(v), 0));
}

export type Line = { description: string; qty: number; unit: number };
export type Totals = { net: number; vat: number; gross: number; cisLabour: number | null; cisDeduction: number | null; payable: number };

/** Totals for an invoice. Reverse charge: no VAT added. CIS: 20% of the labour is deducted from what's paid. */
export function totals(lines: Line[], vat: VatTreatment, cisLabour: number | null): Totals {
  const net = lines.reduce((s, l) => s + Math.round(l.qty * pence(l.unit)), 0);
  const v = vat === "Reverse charge" ? 0 : Math.round(net * 0.2);
  const gross = net + v;
  const labour = cisLabour === null ? null : pence(cisLabour);
  const deduction = labour === null ? null : Math.round(labour * 0.2);
  return { net: pounds(net), vat: pounds(v), gross: pounds(gross), cisLabour: labour === null ? null : pounds(labour), cisDeduction: deduction === null ? null : pounds(deduction), payable: pounds(gross - (deduction ?? 0)) };
}

/** Checks before an invoice is made. Returns problems in plain words; empty means fine. */
export function checkInvoice(i: { lines: Line[]; vat: VatTreatment; cis: boolean; cisLabour: number | null; invoiceDate: string; supplyDate: string; termsDays: number; clientName: string; billingAddress: string }): string[] {
  const out: string[] = [];
  if (i.lines.length === 0) out.push("Add at least one line.");
  i.lines.forEach((l, n) => {
    if (!l.description.trim()) out.push(`Line ${n + 1} needs a description.`);
    if (!(l.qty > 0)) out.push(`Line ${n + 1} needs a quantity.`);
    if (!Number.isFinite(l.unit) || l.unit === 0) out.push(`Line ${n + 1} needs a price.`);
    if (/[[\]]/.test(l.description)) out.push(`Line ${n + 1}: take out the square brackets.`);
  });
  const t = totals(i.lines, i.vat, i.cis ? i.cisLabour : null);
  if (t.net <= 0) out.push("The invoice comes to £0 or less. For a refund, raise a credit note instead.");
  if (i.cis && i.vat !== "Reverse charge") out.push("A CIS invoice is reverse charge: no VAT is added.");
  if (i.cis && (i.cisLabour === null || !(i.cisLabour > 0))) out.push("Put in the labour amount for the CIS deduction (from the pricing sheet; materials don't count).");
  if (i.cis && i.cisLabour !== null && i.cisLabour > t.net) out.push("The CIS labour can't be more than the invoice total.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.invoiceDate)) out.push("Put in the invoice date.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.supplyDate)) out.push("Put in the date of supply (for a final invoice, the completion date).");
  if (!(i.termsDays >= 0 && i.termsDays <= 90)) out.push("Payment terms should be between 0 and 90 days.");
  if (!i.clientName.trim()) out.push("The client's name is missing.");
  if (!i.billingAddress.trim()) out.push("Put in the client's billing address.");
  return out;
}

export const invoiceLabel = (n: number, test = false) => `${test ? "TEST-" : ""}INV-${n}`;

/** "INV-546" → 546. Null for anything else. */
export function parseInvoiceNumber(s: string): number | null {
  const m = String(s).trim().match(/^INV-(\d+)$/i);
  return m ? Number(m[1]) : null;
}

/** The next number: one more than the highest anywhere (the ledger's column A, the ledger's "next number", the app). */
export function nextInvoiceNumber(ledgerColumnA: string[], ledgerNext: string, inApp: number[]): number {
  const seen = [...ledgerColumnA.map(parseInvoiceNumber), parseInvoiceNumber(ledgerNext) !== null ? parseInvoiceNumber(ledgerNext)! - 1 : null, ...inApp].filter((n): n is number => n !== null);
  return seen.length ? Math.max(...seen) + 1 : 1;
}

export function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The VAT quarter a date of supply falls in: quarters end 31 Mar, 30 Jun, 30 Sep and 31 Dec. */
export function vatQuarter(iso: string): { end: string; folderName: string } {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const q = Math.ceil(m / 3);
  const ends = [["03-31", "31 Mar"], ["06-30", "30 Jun"], ["09-30", "30 Sep"], ["12-31", "31 Dec"]];
  const [md, label] = ends[q - 1];
  return { end: `${y}-${md}`, folderName: `VAT Qtr to ${label} ${y}` };
}

export const QUARTER_SUBFOLDERS = ["01 - VAT Invoices", "02 - CIS Invoices", "03 - CIS Statements Received (from contractors)", "04 - CIS Statements Issued (to subcontractors)", "05 - Bank Statements"];

export const ukDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** The ledger row for the Invoices tab: only the input columns (A–J, M, P, AA, AB); everything else is a formula. */
export function ledgerRow(i: {
  number: string; invoiceDate: string; supplyDate: string; client: string; clientEmail: string; quoteRef: string; site: string;
  type: InvoiceType; vat: VatTreatment; net: number; cisLabour: number | null; termsDays: number; pdfUrl: string; notes: string;
}): { range: (row: number) => string; values: (string | number)[] }[] {
  return [
    { range: (r) => `Invoices!A${r}:J${r}`, values: [i.number, ukDate(i.invoiceDate), ukDate(i.supplyDate), i.client, i.clientEmail, i.quoteRef, i.site, i.type, i.vat, i.net] },
    ...(i.cisLabour !== null ? [{ range: (r: number) => `Invoices!M${r}`, values: [i.cisLabour] }] : []),
    { range: (r) => `Invoices!P${r}`, values: [i.termsDays] },
    { range: (r) => `Invoices!AA${r}:AB${r}`, values: [i.pdfUrl, i.notes] },
  ];
}
