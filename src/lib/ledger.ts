/**
 * Reading the ledger's Invoices tab, and chasing (finance--chasing-and-payments.md). The ledger works out status,
 * days overdue, late fee and next chase itself; the app reads those as they are. Pure, tested.
 */

export type LedgerInvoice = {
  row: number;
  number: string;
  invoiceDate: string | null; // YYYY-MM-DD
  client: string;
  clientEmail: string;
  quoteRef: string;
  /** The job number the Quote Ref points at: #559, 559 or Q-559 all give 559. */
  jobNumber: number | null;
  site: string;
  type: string;
  vat: string;
  gross: number | null;
  payable: number | null;
  terms: number | null;
  dueDate: string | null;
  sentDate: string | null;
  paidDate: string | null;
  status: string; // Draft, Sent, Overdue, Paid
  daysOverdue: number;
  lateFee: number | null;
  lastChased: string | null;
  nextChase: string | null;
  filedAs: string;
  pdfUrl: string;
  notes: string;
};

const iso = (s: string): string | null => {
  const m = String(s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
};
const money = (s: string): number | null => {
  const t = String(s ?? "").replace(/[£,\s]/g, "");
  if (!t || t === "-") return null;
  const n = Number(t.replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(n) ? n : null;
};
const int = (s: string): number | null => {
  const n = Number(String(s ?? "").trim());
  return String(s ?? "").trim() !== "" && Number.isFinite(n) ? n : null;
};

/** Rows from Invoices!A2:AB501 (formatted values), skipping empty ones. */
export function parseLedger(values: string[][]): LedgerInvoice[] {
  return values
    .map((r, i) => ({ r: r.map((c) => String(c ?? "")), row: i + 2 }))
    .filter(({ r }) => r[0]?.trim())
    .map(({ r, row }) => ({
      row,
      number: r[0].trim(),
      invoiceDate: iso(r[1]),
      client: r[3] ?? "",
      clientEmail: (r[4] ?? "").trim(),
      quoteRef: r[5] ?? "",
      jobNumber: (() => { const m = String(r[5] ?? "").trim().match(/^(?:#|Q-?)?\s*(\d{3,4})$/i); return m ? Number(m[1]) : null; })(),
      site: r[6] ?? "",
      type: r[7] ?? "",
      vat: r[8] ?? "",
      gross: money(r[11]),
      payable: money(r[14]) ?? money(r[11]),
      terms: int(r[15]),
      dueDate: iso(r[16]),
      sentDate: iso(r[17]),
      paidDate: iso(r[18]),
      status: (r[19] ?? "").trim(),
      daysOverdue: int(r[20]) ?? 0,
      lateFee: money(r[21]),
      lastChased: iso(r[22]),
      nextChase: iso(r[23]),
      filedAs: r[25] ?? "",
      pdfUrl: (r[26] ?? "").trim(),
      notes: r[27] ?? "",
    }));
}

export const isOpen = (i: LedgerInvoice) => i.status === "Sent" || i.status === "Overdue";
export const dueForChase = (i: LedgerInvoice, today: string) => isOpen(i) && i.nextChase !== null && i.nextChase <= today;

/** Which chaser: 1 on the due date, 2 at a week overdue, 3 every week after. */
export function chaseStage(daysOverdue: number): 1 | 2 | 3 {
  return daysOverdue < 7 ? 1 : daysOverdue < 14 ? 2 : 3;
}

/** Drive file id from a link like https://drive.google.com/file/d/<id>/view. */
export function driveId(url: string): string | null {
  return url.match(/\/d\/([\w-]{20,})/)?.[1] ?? url.match(/[?&]id=([\w-]{20,})/)?.[1] ?? null;
}

const gbp = (n: number) => "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const uk = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

/** The chaser email. Professional and friendly; the late fee is mentioned, never added (only if you ask). */
export function chaserEmail(i: LedgerInvoice, greeting: string, sender: { name: string; title: string }): { subject: string; body: string; stage: 1 | 2 | 3 } {
  const stage = chaseStage(i.daysOverdue);
  const amount = gbp(i.payable ?? i.gross ?? 0);
  const due = i.dueDate ? uk(i.dueDate) : "the due date";
  const lines =
    stage === 1
      ? [
          `Just a friendly reminder that invoice ${i.number} for ${amount} is due ${i.daysOverdue <= 0 ? "today" : `on ${due}`}. I've attached it again for ease.`,
          "",
          `Payment is by bank transfer, quoting ${i.number} as the reference. The bank details are on the invoice.`,
        ]
      : stage === 2
        ? [
            `Invoice ${i.number} for ${amount} was due on ${due} and is now a week overdue.`,
            "",
            "Under our Terms & Conditions, a late fee of 5% of the outstanding amount can be added for each full week an invoice stays unpaid. Could you let me know when you plan to pay?",
          ]
        : [
            `Invoice ${i.number} for ${amount} is now ${i.daysOverdue} days overdue (it was due on ${due}).`,
            "",
            `Under our Terms & Conditions, late fees of ${gbp(i.lateFee ?? 0)} could now apply, and certificates for the work are held until the invoice is paid in full.`,
            "",
            "If there's a problem with the invoice or with paying it, please give me a call and we can talk it through.",
          ];
  const body = [greeting, "", ...lines, "", "Kind Regards,", sender.name, `${sender.title}, Batt Electrical`, "01296 321321 | battelectrical.com"].join("\n");
  const subject = stage === 1 ? `Invoice ${i.number}: payment due` : `Invoice ${i.number}: overdue`;
  return { subject, body, stage };
}

// ---------- CIS ----------

export type CisReceived = {
  row: number;
  invoice: string;
  contractor: string;
  email: string;
  paidDate: string | null;
  taxMonthEnding: string | null;
  labour: number | null;
  deducted: number | null;
  statementDue: string | null;
  statementReceived: string | null;
  statementFile: string;
  notes: string;
};

/** Rows from 'CIS Received'!A2:L501 (formatted values). */
export function parseCisReceived(values: string[][]): CisReceived[] {
  return values
    .map((r, i) => ({ r: r.map((c) => String(c ?? "")), row: i + 2 }))
    .filter(({ r }) => r[0]?.trim())
    .map(({ r, row }) => ({
      row, invoice: r[0].trim(), contractor: r[1] ?? "", email: (r[2] ?? "").trim(), paidDate: iso(r[3]), taxMonthEnding: iso(r[4]),
      labour: money(r[5]), deducted: money(r[6]), statementDue: iso(r[7]), statementReceived: iso(r[8]), statementFile: (r[9] ?? "").trim(), notes: r[11] ?? "",
    }));
}

/** A contractor's statement is missing once its due date (the 19th after the tax month) has passed. */
export const statementMissing = (c: CisReceived, today: string) => c.paidDate !== null && c.statementReceived === null && c.statementDue !== null && c.statementDue < today;

/** The CIS tax month a payment falls in ends on the 5th: the 6th of one month to the 5th of the next. */
export function taxMonthEnding(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const end = d <= 5 ? new Date(Date.UTC(y, m - 1, 5)) : new Date(Date.UTC(y, m, 5));
  return end.toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const taxMonthLabel = (end: string) => `5 ${MONTHS[Number(end.slice(5, 7)) - 1]} ${end.slice(0, 4)}`;

/** Asking a contractor for a missing payment and deduction statement: polite, specific. */
export function statementRequest(rows: CisReceived[], greeting: string, sender: { name: string; title: string }) {
  const end = rows[0].taxMonthEnding ? taxMonthLabel(rows[0].taxMonthEnding) : "last tax month";
  const list = rows.map((r) => `- ${r.invoice}${r.paidDate ? `, paid ${uk(r.paidDate)}` : ""}${r.deducted !== null ? `, CIS deducted ${gbp(r.deducted)}` : ""}`);
  return {
    subject: `CIS payment and deduction statement: tax month ending ${end}`,
    body: [
      greeting, "",
      `Please could you send us the CIS payment and deduction statement for the tax month ending ${end}? It covers:`, "",
      ...list, "",
      "Statements are due within 14 days of the end of the tax month, and we need it for our records.", "",
      "Thanks very much.", "",
      "Kind Regards,", sender.name, `${sender.title}, Batt Electrical`, "01296 321321 | battelectrical.com",
    ].join("\n"),
  };
}

/** A payment to a subcontractor under CIS: labour is the gross less materials; the deduction is on the labour only. */
export function cisPayment(gross: number, materials: number, rate: number) {
  const p = (n: number) => Math.round(n * 100);
  const labour = p(gross) - p(materials);
  const deducted = Math.round(labour * rate);
  return { labour: labour / 100, deducted: deducted / 100, net: (p(gross) - deducted) / 100 };
}

export type Subcontractor = { row: number; name: string; tradingAs: string; utr: string; verification: string; rate: number | null; email: string; address: string; notes: string };

export function parseSubcontractors(values: string[][]): Subcontractor[] {
  return values
    .map((r, i) => ({ r: r.map((c) => String(c ?? "")), row: i + 2 }))
    .filter(({ r }) => r[0]?.trim())
    .map(({ r, row }) => {
      const pct = String(r[4] ?? "").trim();
      const rate = pct.endsWith("%") ? Number(pct.slice(0, -1)) / 100 : pct === "" ? null : Number(pct);
      const known = (s: string) => (/^\[?tbc\]?$/i.test(s.trim()) ? "" : s.trim());
      return { row, name: r[0].trim(), tradingAs: r[1] ?? "", utr: (r[2] ?? "").trim(), verification: known(r[3] ?? ""), rate: rate !== null && Number.isFinite(rate) ? rate : null, email: known(r[5] ?? ""), address: known(r[6] ?? ""), notes: r[7] ?? "" };
    });
}
