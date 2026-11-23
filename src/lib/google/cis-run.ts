import "server-only";
/** CIS in both directions (finance--cis.md), kept in the ledger's CIS Received and CIS Paid (Subcontractors) tabs. */
import { sql } from "../db";
import { audit } from "../mutations";
import { todayUK } from "../jobs-rules";
import { firstName } from "../email";
import { cisPayment, parseCisReceived, parseSubcontractors, statementMissing, statementRequest, taxMonthEnding, taxMonthLabel, type CisReceived } from "../ledger";
import { QUARTER_SUBFOLDERS, ukDate, vatQuarter } from "../invoicing";
import { preparedByFor } from "../quote-drafts";
import { google, SHEETS } from "./client";
import { createDraft } from "./gmail";
import { createFolder, listChildren } from "./drive";
import { invoicePlaces } from "./invoice-run";
import { uploadPdf } from "./quote-run";

async function read(email: string, ledgerId: string, range: string) {
  const r = await google<{ values?: string[][] }>(email, `${SHEETS}/v4/spreadsheets/${ledgerId}/values/${encodeURIComponent(range)}`, { query: { valueRenderOption: "FORMATTED_VALUE" } });
  return (r.values ?? []).map((row) => row.map((c) => String(c ?? "")));
}

async function write(email: string, ledgerId: string, data: { range: string; values: (string | number)[] }[]) {
  await google(email, `${SHEETS}/v4/spreadsheets/${ledgerId}/values:batchUpdate`, {
    method: "POST",
    body: { valueInputOption: "USER_ENTERED", data: data.map((d) => ({ range: d.range, values: [d.values] })) },
  });
}

/** The first empty row on a tab (data starts on row 2; formulas are filled down in advance). */
async function firstEmptyRow(email: string, ledgerId: string, tab: string) {
  const colA = (await read(email, ledgerId, `'${tab}'!A2:A501`)).map((r) => r[0] ?? "");
  const empty = colA.findIndex((v) => v.trim() === "");
  const row = (empty === -1 ? colA.length : empty) + 2;
  if (row > 501) throw new Error(`The ledger's ${tab} tab is full (row 501). Extend its formulas first.`);
  return row;
}

/** A CIS invoice gets its CIS Received row: invoice, contractor, their email and the labour. */
export async function addCisReceivedRow(email: string, ledgerId: string, i: { invoice: string; contractor: string; contractorEmail: string; labour: number }) {
  const rows = parseCisReceived(await read(email, ledgerId, "'CIS Received'!A2:L501"));
  if (rows.some((r) => r.invoice === i.invoice)) return;
  const row = await firstEmptyRow(email, ledgerId, "CIS Received");
  await write(email, ledgerId, [
    { range: `'CIS Received'!A${row}:C${row}`, values: [i.invoice, i.contractor, i.contractorEmail] },
    { range: `'CIS Received'!F${row}`, values: [i.labour] },
  ]);
}

/** When a CIS invoice is paid, its CIS Received row gets the Paid Date too: that starts the statement clock. */
export async function markCisReceivedPaid(email: string, ledgerId: string, invoice: string, date: string) {
  const r = parseCisReceived(await read(email, ledgerId, "'CIS Received'!A2:L501")).find((x) => x.invoice === invoice);
  if (!r) return false;
  await write(email, ledgerId, [{ range: `'CIS Received'!D${r.row}`, values: [ukDate(date)] }]);
  return true;
}

export type CisPaidRow = { row: number; date: string; name: string; gross: string; materials: string; deducted: string; net: string; taxMonthEnding: string; statementIssued: string };

export async function readCis(email: string) {
  const places = await invoicePlaces(email);
  const [received, subs, paid] = await Promise.all([
    read(email, places.ledgerId, "'CIS Received'!A2:L501"),
    read(email, places.ledgerId, "Subcontractors!A2:H50"),
    read(email, places.ledgerId, "'CIS Paid (Subcontractors)'!A2:R501"),
  ]);
  return {
    test: places.test,
    received: parseCisReceived(received),
    subcontractors: parseSubcontractors(subs),
    paid: paid
      .map((r, i) => ({ r, row: i + 2 }))
      .filter(({ r }) => r[0]?.trim())
      .map(({ r, row }): CisPaidRow => ({ row, date: r[0], name: r[1] ?? "", gross: r[5] ?? "", materials: r[6] ?? "", deducted: r[8] ?? "", net: r[9] ?? "", taxMonthEnding: r[10] ?? "", statementIssued: r[12] ?? "" })),
  };
}

/** Drafts a request for each missing statement from one contractor. */
export async function requestStatement(me: { email: string; name: string }, contractor: string) {
  const { received } = await readCis(me.email);
  const missing = received.filter((r) => r.contractor === contractor && statementMissing(r, todayUK()));
  if (missing.length === 0) throw new Error(`No missing statements from ${contractor}.`);
  const to = missing.find((m) => m.email)?.email ?? "";
  if (!to) throw new Error(`There's no email for ${contractor} on the CIS Received tab. Add it there or on the client.`);
  const [c] = await sql<{ contact: string }[]>`select contact from clients where lower(name) = lower(${contractor})`;
  const name = firstName(c?.contact ?? "");
  const sender = (await preparedByFor(me.email)) ?? { name: me.email, title: "" };
  const e = statementRequest(missing, name ? `Hi ${name},` : "Hello,", sender);
  const d = await createDraft(me.email, { to, cc: "", subject: e.subject, body: e.body, attachments: [] });
  await audit(sql, me.email, "CIS statement requested", "client", contractor, { invoices: missing.map((m) => m.invoice) });
  return d.url;
}

/** Files a contractor's statement in the quarter's 03 folder and fills Statement Received and Statement File. */
export async function fileStatement(me: { email: string }, invoices: string[], received: string, pdf: { name: string; data: Uint8Array }) {
  const places = await invoicePlaces(me.email);
  const rows = parseCisReceived(await read(me.email, places.ledgerId, "'CIS Received'!A2:L501")).filter((r) => invoices.includes(r.invoice));
  if (rows.length === 0) throw new Error("Pick the invoices the statement covers.");
  const first: CisReceived = rows[0];
  const end = first.taxMonthEnding ?? taxMonthEnding(first.paidDate ?? received);
  const quarterName = vatQuarter(end).folderName;
  const quarter = (await listChildren(me.email, [places.root], true)).find((f) => f.name === quarterName)?.id ?? (await createFolder(me.email, quarterName, places.root)).id;
  const subs = await listChildren(me.email, [quarter], true);
  for (const name of QUARTER_SUBFOLDERS) if (!subs.some((s) => s.name === name)) subs.push({ ...(await createFolder(me.email, name, quarter)), mimeType: "" });
  const folder = subs.find((s) => s.name.startsWith("03"))!.id;
  const saved = await uploadPdf(me.email, `CIS Statement – ${first.contractor} – Tax month ending ${taxMonthLabel(end)}.pdf`, folder, pdf.data);
  await write(me.email, places.ledgerId, rows.flatMap((r) => [{ range: `'CIS Received'!I${r.row}:J${r.row}`, values: [ukDate(received), saved.url] }]));
  await audit(sql, me.email, "CIS statement filed", "client", first.contractor, { invoices, file: saved.url });
  return saved.url;
}

/** A payment to a subcontractor (Jed) under CIS: adds the CIS Paid row and says what to pay him. */
export async function recordSubcontractorPayment(me: { email: string }, p: { date: string; name: string; gross: number; materials: number; notes: string }) {
  const places = await invoicePlaces(me.email);
  const sub = parseSubcontractors(await read(me.email, places.ledgerId, "Subcontractors!A2:H50")).find((s) => s.name.toLowerCase() === p.name.toLowerCase());
  if (!sub) throw new Error(`${p.name} isn't on the ledger's Subcontractors tab.`);
  if (sub.rate === null) throw new Error(`${p.name}'s deduction rate isn't on the Subcontractors tab.`);
  if (!(p.gross > 0) || p.materials < 0 || p.materials > p.gross) throw new Error("Put in the gross amount (before VAT) and any materials, which can't be more than the gross.");
  const calc = cisPayment(p.gross, p.materials, sub.rate);
  const row = await firstEmptyRow(me.email, places.ledgerId, "CIS Paid (Subcontractors)");
  await write(me.email, places.ledgerId, [
    { range: `'CIS Paid (Subcontractors)'!A${row}:G${row}`, values: [ukDate(p.date), sub.name, sub.utr, sub.verification, sub.rate, p.gross, p.materials] },
    ...(p.notes ? [{ range: `'CIS Paid (Subcontractors)'!R${row}`, values: [p.notes] }] : []),
  ]);
  await audit(sql, me.email, "subcontractor paid", "subcontractor", sub.name, { date: p.date, gross: p.gross, materials: p.materials, ...calc });
  return { ...calc, rate: sub.rate, taxMonthEnding: taxMonthEnding(p.date) };
}
