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
