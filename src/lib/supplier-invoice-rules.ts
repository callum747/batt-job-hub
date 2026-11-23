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
};

export type Decision =
  | { status: "filed"; jobNumber: number; amount: number; reason: string }
  | { status: "check" | "ignored"; jobNumber: number | null; amount: number | null; reason: string };

/** Job numbers in an order reference like "#552 CBRE CROYDEN" or "PO 557/558". */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(/(?<![\d.£,])#?\s?(\d{3,4})(?![\d.,]\d)/g)].map((m) => Number(m[1]));
}

const close = (a: number, b: number) => Math.abs(a - b) <= 0.02;

/**
 * `jobs` maps every known job number (including numbers merged into a job) to the job's own number.
 * `alreadyFiled` is true when the same supplier's invoice number is already on a job.
 */
export function decide(r: InvoiceReading, jobs: Map<number, number>, alreadyFiled: boolean): Decision {
  const none = { jobNumber: null, amount: null };
  if (!r.is_invoice_or_credit_note) return { status: "ignored", ...none, reason: "Not an invoice or credit note (a quote, statement or order confirmation)." };
  if (alreadyFiled) return { status: "ignored", ...none, reason: `${r.supplier} ${r.invoice_number} is already on a job.` };
  if (!r.addressed_to_batt) return { status: "check", ...none, reason: "It isn't clearly made out to Batt Electrical." };
  if (r.net === null || r.vat === null || r.gross === null) return { status: "check", ...none, reason: "Couldn't read the net, VAT and total." };
  if (!close(r.net + r.vat, r.gross)) return { status: "check", ...none, reason: `Net £${r.net.toFixed(2)} + VAT £${r.vat.toFixed(2)} doesn't equal the total £${r.gross.toFixed(2)}.` };
  const amount = Math.round((r.is_credit_note ? -Math.abs(r.net) : r.net) * 100) / 100;
  const found = [...new Set([...r.job_numbers, ...numbersIn(r.order_reference)].map((n) => jobs.get(n)).filter((n): n is number => n !== undefined))];
  if (found.length === 0) return { status: "check", jobNumber: null, amount, reason: r.order_reference ? `No job number found in the order reference "${r.order_reference}".` : "No job number on it." };
  if (found.length > 1) return { status: "check", jobNumber: null, amount, reason: `More than one job on it: ${found.map((n) => `#${n}`).join(", ")}.` };
  return { status: "filed", jobNumber: found[0], amount, reason: `Order reference "${r.order_reference || found[0]}".` };
}
