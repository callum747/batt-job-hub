/**
 * Fills Batt's invoice template (finance--docs-editing.md). Two passes, each on a fresh read:
 * structure (works rows, CIS rows, reverse charge box), then text. The header and footer bands are
 * images anchored in the header and footer, so nothing there is ever touched. Pure, tested.
 */
import { cellText, findTable, findTableByCell, money, paragraphs, replaceInParagraph, resizeRows, setCell, setParagraph, tables, toBatch, type Doc, type Edit, type Para, type Request } from "./docs";
import type { Line, Totals } from "./invoicing";

export type InvoiceDoc = {
  label: string; // INV-546 (TEST-INV-1 in test mode)
  invoiceDate: string; // DD/MM/YYYY
  supplyDate: string;
  dueDate: string;
  termsDays: number;
  quoteRef: string; // the job number, e.g. 559
  client: { name: string; address: string; email: string };
  site: string;
  lines: Line[];
  totals: Totals;
  cis: boolean;
  reverseCharge: boolean;
  contact: { name: string; email: string };
};

const WORKS = ["Description", "Qty", "Unit price", "VAT", "Amount ex VAT"];
const need = <T,>(x: T | null | undefined, what: string): T => {
  if (x === null || x === undefined) throw new Error(`The invoice template has changed: couldn't find ${what}.`);
  return x;
};
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

function reverseBox(doc: Doc) {
  return tables(doc.body?.content).find((t) => t.rows.length === 1 && t.rows[0].length === 1 && /^REVERSE CHARGE/.test(cellText(t.rows[0][0]).trim())) ?? null;
}

/** Pass 1: the right number of works rows; CIS rows and the reverse charge box only where they apply. */
export function invoiceStructurePass(doc: Doc, inv: InvoiceDoc): Request[] {
  const edits: (Edit | null)[] = [];
  const works = need(findTable(doc, WORKS), "the works table");
  edits.push(resizeRows(works, 1, works.rows.length - 1, inv.lines.length));

  const totals = need(findTableByCell(doc, "Subtotal (ex VAT)", 1), "the totals table");
  if (!inv.cis) {
    // Amount payable, Less CIS and the thin spacer above them, from the bottom up.
    const start = { index: totals.start };
    edits.push({
      at: totals.start,
      requests: [5, 4, 3].map((rowIndex) => ({ deleteTableRow: { tableCellLocation: { tableStartLocation: start, rowIndex, columnIndex: 0 } } })),
    });
  }

  if (!inv.reverseCharge) {
    const box = need(reverseBox(doc), "the reverse charge box");
    // The box and the empty paragraph just before it.
    const blocks = doc.body?.content ?? [];
    const i = blocks.findIndex((b) => b.startIndex === box.start);
    const before = blocks[i - 1];
    const from = before?.paragraph && (before.paragraph.elements ?? []).map((e) => e.textRun?.content ?? "").join("") === "\n" ? before.startIndex! : box.start;
    edits.push({ at: from, requests: [{ deleteContentRange: { range: { startIndex: from, endIndex: box.block.endIndex! } } }] });
  }
  return toBatch(edits);
}

/** Pass 2: every word and number. */
export function invoiceTextPass(doc: Doc, inv: InvoiceDoc): Request[] {
  const ps = paragraphs(doc.body?.content);
  const first = (t: (p: Para) => boolean, what: string) => need(ps.find(t), what);
  const edits: (Edit | null)[] = [];
  const t = inv.totals;

  // Title.
  edits.push(replaceInParagraph(first((p) => /Invoice INV-\[000\]/.test(p.text), "the title"), "INV-[000]", inv.label));

  // Details panel.
  const panel = need(findTableByCell(doc, "Invoice number", 0), "the details panel");
  const row = (label: string) => need(panel.rows.find((r) => cellText(r[0]).trim() === label), `the "${label}" row`);
  edits.push(...setCell(row("Invoice number")[1], inv.label));
  edits.push(...setCell(row("Invoice date")[1], inv.invoiceDate));
  edits.push(...setCell(row("Date of supply")[1], inv.supplyDate));
  edits.push(...setCell(row("Payment due")[1], inv.dueDate));
  edits.push(...setCell(row("Quote reference")[1], inv.quoteRef || "–"));

  // Billed to and site.
  const addr = inv.client.address.split(/\r?\n|,(?=\s*[A-Z]{1,2}\d)/).map(clean).filter(Boolean);
  const line1 = addr.length > 1 ? addr.slice(0, -1).join(", ") : (addr[0] ?? "");
  const line2 = addr.length > 1 ? addr[addr.length - 1] : "";
  edits.push(setParagraph(first((p) => p.text.trim() === "[Client name]", "[Client name]"), clean(inv.client.name)));
  edits.push(setParagraph(first((p) => p.text.trim() === "[Address line 1]", "[Address line 1]"), line1));
  edits.push(setParagraph(first((p) => p.text.trim() === "[Town, postcode]", "[Town, postcode]"), line2));
  edits.push(setParagraph(first((p) => p.text.trim() === "[Client email]", "[Client email]"), clean(inv.client.email)));
  edits.push(setParagraph(first((p) => p.text.trim() === "[Site or job address, postcode]", "the site line"), clean(inv.site) || "–"));

  // Works.
  const works = need(findTable(doc, WORKS), "the works table");
  if (works.rows.length - 1 !== inv.lines.length) throw new Error("The works table doesn't have the right number of rows yet.");
  inv.lines.forEach((l, i) => {
    const r = works.rows[i + 1];
    edits.push(...setCell(r[0], clean(l.description)));
    edits.push(...setCell(r[1], qtyText(l.qty)));
    edits.push(...setCell(r[2], money(l.unit)));
    edits.push(...setCell(r[3], inv.reverseCharge ? "RC 20%" : "20%"));
    edits.push(...setCell(r[4], money(Math.round(l.qty * l.unit * 100) / 100)));
  });

  // Totals.
  const totals = need(findTableByCell(doc, "Subtotal (ex VAT)", 1), "the totals table");
  const tRow = (label: string) => need(totals.rows.find((r) => cellText(r[1]).trim() === label), `the "${label}" row`);
  edits.push(...setCell(tRow("Subtotal (ex VAT)")[2], money(t.net)));
  const vatRow = tRow("VAT @ 20%");
  if (inv.reverseCharge) edits.push(...setCell(vatRow[1], "VAT (reverse charge)"));
  edits.push(...setCell(vatRow[2], money(t.vat)));
  edits.push(...setCell(tRow("Total due")[2], money(t.gross)));
  if (inv.cis) {
    const cisRow = tRow("[Less CIS (20% of labour)]");
    edits.push(...setCell(cisRow[1], "Less CIS (20% of labour)"));
    edits.push(...setCell(cisRow[2], `–${money(t.cisDeduction ?? 0)}`));
    const payRow = tRow("[Amount payable]");
    edits.push(...setCell(payRow[1], "Amount payable"));
    edits.push(...setCell(payRow[2], money(t.payable)));
  }

  // The reverse charge box keeps its wording, without the note to whoever fills it in.
  if (inv.reverseCharge) {
    const box = need(reverseBox(doc), "the reverse charge box");
    edits.push(replaceInParagraph(box.rows[0][0][0], "  (delete this box if not applicable)", ""));
  }

  // Payment details.
  const pay = need(findTableByCell(doc, "Payment reference", 0), "the payment table");
  const payRow = need(pay.rows.find((r) => cellText(r[0]).trim() === "Payment reference"), "the payment reference row");
  edits.push(...setCell(payRow[1], inv.label));
  edits.push(...setCell(payRow[3], money(t.payable)));

  // Due date line: both placeholders are in one paragraph, so one edit replaces the pair.
  const due = first((p) => p.text.startsWith("Payment is due by [DD/MM/YYYY]"), "the payment due line");
  const dueFrom = due.text.indexOf("[DD/MM/YYYY]");
  const dueTo = due.text.indexOf("[7]") + "[7]".length;
  const dueText = due.text.slice(dueFrom, dueTo).replace("[DD/MM/YYYY]", inv.dueDate).replace("[7]", String(inv.termsDays));
  edits.push({ at: due.start + dueFrom, requests: replaceInParagraph({ ...due, text: due.text }, due.text.slice(dueFrom, dueTo), dueText)!.requests });

  // Who to contact: "Contact [Name] on 01296 321321 or [email]@battelectrical.com."
  const contact = first((p) => p.text.includes("[Name]") && p.text.includes("[email]@battelectrical.com"), "the contact line");
  const cFrom = contact.text.indexOf("[Name]");
  const cTo = contact.text.indexOf("[email]@battelectrical.com") + "[email]@battelectrical.com".length;
  const cText = contact.text.slice(cFrom, cTo).replace("[Name]", inv.contact.name).replace("[email]@battelectrical.com", inv.contact.email);
  edits.push({ at: contact.start + cFrom, requests: replaceInParagraph(contact, contact.text.slice(cFrom, cTo), cText)!.requests });

  return toBatch(edits);
}

/** Checks before the template is touched: nothing that would leave a bracket or a blank where money goes. */
export function checkInvoiceDoc(inv: InvoiceDoc): string[] {
  const out: string[] = [];
  const text = [inv.client.name, inv.client.address, inv.client.email, inv.site, inv.contact.name, ...inv.lines.map((l) => l.description)];
  if (text.some((s) => /[[\]]/.test(s))) out.push("Take out the square brackets: anything in [ ] looks like an unfilled placeholder.");
  if (inv.lines.length === 0) out.push("Add at least one line.");
  if (inv.lines.length > 12) out.push("Keep it to 12 lines or fewer so the invoice fits on one page.");
  if (!inv.contact.email.endsWith("@battelectrical.com")) out.push("The contact email must be a battelectrical.com address.");
  return out;
}
