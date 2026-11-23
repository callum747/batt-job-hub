import "server-only";
/** The Invoices page: reads the ledger (live, or the test copy in test mode), drafts chasers, records payments. */
import { sql } from "../db";
import { audit } from "../mutations";
import { todayUK } from "../jobs-rules";
import { findEmail, firstName } from "../email";
import { chaserEmail, driveId, isOpen, parseLedger, type LedgerInvoice } from "../ledger";
import { ukDate } from "../invoicing";
import { preparedByFor } from "../quote-drafts";
import { google, SHEETS } from "./client";
import { createDraft, driveFileBytes } from "./gmail";
import { invoicePlaces, markInvoice } from "./invoice-run";

export async function readLedger(email: string): Promise<{ test: boolean; invoices: LedgerInvoice[] }> {
  const places = await invoicePlaces(email);
  const r = await google<{ values?: string[][] }>(email, `${SHEETS}/v4/spreadsheets/${places.ledgerId}/values/${encodeURIComponent("Invoices!A2:AB501")}`, { query: { valueRenderOption: "FORMATTED_VALUE" } });
  return { test: places.test, invoices: parseLedger(r.values ?? []) };
}

async function find(email: string, number: string) {
  const { test, invoices } = await readLedger(email);
  const i = invoices.find((x) => x.number === number);
  if (!i) throw new Error(`${number} isn't in the ${test ? "test " : ""}ledger.`);
  return { test, i, ledgerId: (await invoicePlaces(email)).ledgerId };
}

async function writeCell(email: string, ledgerId: string, cell: string, value: string) {
  await google(email, `${SHEETS}/v4/spreadsheets/${ledgerId}/values/${encodeURIComponent(`Invoices!${cell}`)}`, {
    method: "PUT", query: { valueInputOption: "USER_ENTERED" }, body: { values: [[value]] },
  });
}

/** The client contact's first name for the greeting, from the app's client record. */
async function greeting(client: string) {
  const [c] = await sql<{ contact: string }[]>`select contact from clients where lower(name) = lower(${client})`;
  const name = firstName(c?.contact ?? "");
  return name ? `Hi ${name},` : "Hello,";
}

export async function chaserStart(email: string, number: string) {
  const { i } = await find(email, number);
  if (!isOpen(i)) throw new Error(`${number} is ${i.status || "not sent yet"}, so there's nothing to chase.`);
  const sender = (await preparedByFor(email)) ?? { name: email, title: "" };
  const e = chaserEmail(i, await greeting(i.client), sender);
  const [c] = await sql<{ email: string; contact: string }[]>`select email, contact from clients where lower(name) = lower(${i.client})`;
  return { ...e, to: i.clientEmail || c?.email || findEmail(c?.contact ?? "") || "", cc: "", attach: Boolean(driveId(i.pdfUrl)) };
}

/** Saves the chaser as a Gmail draft (with the invoice attached when the ledger links its PDF) and fills Last Chased. */
export async function draftChaser(me: { email: string; name: string }, number: string, e: { to: string; cc: string; subject: string; body: string }) {
  const { i, ledgerId } = await find(me.email, number);
  const id = driveId(i.pdfUrl);
  const attachments = id ? [{ name: `${number}.pdf`, mimeType: "application/pdf", data: await driveFileBytes(me.email, id) }] : [];
  const d = await createDraft(me.email, { to: e.to, cc: e.cc, subject: e.subject, body: e.body, attachments });
  await writeCell(me.email, ledgerId, `W${i.row}`, ukDate(todayUK()));
  await audit(sql, me.email, "invoice chased", "invoice", number, { to: e.to, stage: e.subject });
  return { url: d.url, attached: attachments.length > 0 };
}

/**
 * Records a payment. If the amount received isn't the amount payable it isn't marked paid (finance rules):
 * it may be a part payment or a CIS miscalculation, so a person looks at it.
 */
export async function recordPayment(me: { email: string; name: string }, number: string, date: string, received: number) {
  const { i, ledgerId, test } = await find(me.email, number);
  if (!isOpen(i) && i.status !== "Draft") throw new Error(`${number} is already ${i.status}.`);
  const due = i.payable ?? i.gross ?? 0;
  if (Math.abs(received - due) > 0.005) {
    throw new Error(`${number} is for £${due.toFixed(2)} but £${received.toFixed(2)} was received. It hasn't been marked paid: check whether it's a part payment or a CIS difference.`);
  }
  // An invoice the app made: mark it through the app, which also moves the job on when it's the last one.
  const n = Number(number.replace(/^(TEST-)?INV-/, ""));
  const [mine] = await sql<{ id: string }[]>`select id from invoices where number = ${n} and test = ${test} and status in ('made', 'sent')`;
  if (mine) return markInvoice(mine.id, "paid", date, me);
  await writeCell(me.email, ledgerId, `S${i.row}`, ukDate(date));
  await audit(sql, me.email, "invoice paid", "invoice", number, { date, received });
  return "";
}

/** Fills Sent Date for an invoice in the ledger (through the app's record when the app made it). */
export async function recordSent(me: { email: string; name: string }, number: string, date: string) {
  const { i, ledgerId, test } = await find(me.email, number);
  if (i.sentDate) throw new Error(`${number} was already marked sent on ${ukDate(i.sentDate)}.`);
  const n = Number(number.replace(/^(TEST-)?INV-/, ""));
  const [mine] = await sql<{ id: string }[]>`select id from invoices where number = ${n} and test = ${test} and status = 'made'`;
  if (mine) return markInvoice(mine.id, "sent", date, me);
  await writeCell(me.email, ledgerId, `R${i.row}`, ukDate(date));
  await audit(sql, me.email, "invoice sent", "invoice", number, { date });
  return "";
}
