import "server-only";
/**
 * Makes an invoice (finance--invoicing.md): reserves the next number, copies the invoice template into the
 * right VAT quarter folder, fills it, checks it's one page with nothing left in brackets, saves the PDF beside
 * it and in the job's 01 folder, then adds the row to the ledger's Invoices tab.
 *
 * Test mode: numbers run TEST-INV-1, TEST-INV-2…, files go in "Invoices (TEST)" inside the test folder, and
 * rows go in a copy of the ledger there. The real ledger, real folders and real numbers aren't touched.
 */
import { sql } from "../db";
import { audit, changeStage } from "../mutations";
import { leftoverPlaceholders, pdfPageCount } from "../docs";
import { checkInvoiceDoc, invoiceStructurePass, invoiceTextPass, type InvoiceDoc } from "../invoice-doc";
import { addDays, invoiceLabel, ledgerRow, nextInvoiceNumber, QUARTER_SUBFOLDERS, totals, ukDate, vatQuarter, type InvoiceType, type Line, type VatTreatment } from "../invoicing";
import { todayUK } from "../jobs-rules";
import { createFolder, getFile, listChildren, syncJobFolder } from "./drive";
import { errorText, google, googleSettings, SHEETS } from "./client";
import { quoteFolder, templateId } from "./pricing-run";
import { batch, exportPdf, getDoc, uploadPdf } from "./quote-run";

type Finance = { ledgerId: string; invoicingFolder: string; test: { folder: string | null; ledgerId: string | null } };

async function financeSettings(): Promise<Finance> {
  const [row] = await sql<{ value: Finance }[]>`select value from settings where key = 'finance'`;
  if (!row) throw new Error("The finance settings are missing.");
  return row.value;
}

async function saveTestPlaces(t: Finance["test"]) {
  await sql`update settings set value = jsonb_set(value, '{test}', ${sql.json(t)}), updated_at = now() where key = 'finance'`;
}

async function childFolder(email: string, parent: string, name: string) {
  const found = (await listChildren(email, [parent], true)).find((f) => f.name === name);
  return found?.id ?? (await createFolder(email, name, parent)).id;
}

/** Where invoices and the ledger are, for the current mode. Test mode makes its folder and ledger copy on first use. */
export async function invoicePlaces(email: string): Promise<{ test: boolean; root: string; ledgerId: string }> {
  const [g, f] = await Promise.all([googleSettings(), financeSettings()]);
  if (g.mode === "live") return { test: false, root: f.invoicingFolder, ledgerId: f.ledgerId };
  const t = { ...f.test };
  if (!t.folder) {
    // The test area is the folder that holds the test Live folder: "ZZ – Job Hub TEST".
    const testArea = (await getFile(email, g.test.folders.Live)).parents?.[0];
    if (!testArea) throw new Error("Couldn't find the test folder in Drive.");
    t.folder = await childFolder(email, testArea, "Invoices (TEST)");
  }
  if (!t.ledgerId) {
    const copy = await google<{ id: string }>(email, `/drive/v3/files/${f.ledgerId}/copy`, {
      method: "POST",
      query: { supportsAllDrives: true, fields: "id" },
      body: { name: "TEST – 00 - Batt Job Hub (copy for the app's test mode)", parents: [t.folder] },
    });
    t.ledgerId = copy.id;
  }
  if (t.folder !== f.test.folder || t.ledgerId !== f.test.ledgerId) await saveTestPlaces(t);
  return { test: true, root: t.folder, ledgerId: t.ledgerId };
}

/** The quarter folder for a date of supply, with its five subfolders, made if it doesn't exist. */
async function quarterFolder(email: string, root: string, supplyDate: string, cis: boolean) {
  const { folderName } = vatQuarter(supplyDate);
  const quarter = await childFolder(email, root, folderName);
  const have = await listChildren(email, [quarter], true);
  for (const name of QUARTER_SUBFOLDERS) if (!have.some((h) => h.name === name)) await createFolder(email, name, quarter);
  const subs = await listChildren(email, [quarter], true);
  return subs.find((s) => s.name === (cis ? "02 - CIS Invoices" : "01 - VAT Invoices"))!.id;
}

async function readColumn(email: string, ledgerId: string, range: string) {
  const r = await google<{ values?: string[][] }>(email, `${SHEETS}/v4/spreadsheets/${ledgerId}/values/${encodeURIComponent(range)}`, { query: { valueRenderOption: "FORMATTED_VALUE" } });
  return (r.values ?? []).map((row) => String(row[0] ?? ""));
}

/**
 * Reserves the next number. A number from an invoice that failed is used again first, so there's never a gap.
 * Live numbers also check the ledger's column A and its "next number", so an invoice raised by hand is never clashed with.
 */
async function reserveNumber(email: string, places: { test: boolean; ledgerId: string }, jobId: string, by: string): Promise<{ id: string; number: number }> {
  const [ledgerA, ledgerNext] = places.test ? [[], ""] : await Promise.all([readColumn(email, places.ledgerId, "Invoices!A2:A501"), readColumn(email, places.ledgerId, "'How to use'!B2").then((v) => v[0] ?? "")]);
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('invoice-number'))`;
    const [failed] = await tx<{ id: string; number: number }[]>`
      select id, number from invoices where test = ${places.test} and status = 'failed' order by number limit 1 for update`;
    if (failed) {
      await tx`update invoices set status = 'started', job_id = ${jobId}, note = '', created_by = ${by}, created_at = now() where id = ${failed.id}`;
      return failed;
    }
    const inApp = (await tx<{ number: number }[]>`select number from invoices where test = ${places.test}`).map((r) => r.number);
    const number = nextInvoiceNumber(places.test ? [] : ledgerA, places.test ? "" : ledgerNext, inApp);
    const [row] = await tx<{ id: string }[]>`
      insert into invoices (job_id, test, number, type, invoice_date, supply_date, terms_days, due_date, created_by)
      values (${jobId}, ${places.test}, ${number}, 'Other', ${todayUK()}, ${todayUK()}, 0, ${todayUK()}, ${by}) returning id`;
    return { id: row.id, number };
  });
}

export type InvoiceForm = {
  type: InvoiceType;
  stageLabel: string;
  vat: VatTreatment;
  cis: boolean;
  cisLabour: number | null;
  invoiceDate: string;
  supplyDate: string;
  termsDays: number;
  clientName: string;
  clientEmail: string;
  billingAddress: string;
  site: string;
  lines: Line[];
  notes: string;
};

export type InvoiceOutcome = { ok: boolean; message: string; problems?: string[]; label?: string; docUrl?: string; pdfUrl?: string; invoiceId?: string };

export async function makeInvoice(jobId: string, f: InvoiceForm, me: { email: string; name: string }): Promise<InvoiceOutcome> {
  const t = totals(f.lines, f.vat, f.cis ? f.cisLabour : null);
  let reserved: { id: string; number: number } | null = null;
  let docUrl = "";
  try {
    const [job] = await sql<{ number: number | null; legacy_ref: string; site: string; client: string | null; drive_folder_id: string; stage: string }[]>`
      select j.number, j.legacy_ref, j.site, c.name as client, j.drive_folder_id, j.stage from jobs j left join clients c on c.id = j.client_id where j.id = ${jobId}`;
    if (!job) return { ok: false, message: "That job doesn't exist." };
    const quoteRef = job.number ? String(job.number) : job.legacy_ref;
    const places = await invoicePlaces(me.email);
    reserved = await reserveNumber(me.email, places, jobId, me.email);
    const label = invoiceLabel(reserved.number, places.test);
    const due = addDays(f.invoiceDate, f.termsDays);
    const docInput: InvoiceDoc = {
      label, invoiceDate: ukDate(f.invoiceDate), supplyDate: ukDate(f.supplyDate), dueDate: ukDate(due), termsDays: f.termsDays, quoteRef,
      client: { name: f.clientName, address: f.billingAddress, email: f.clientEmail }, site: f.site, lines: f.lines, totals: t,
      cis: f.cis, reverseCharge: f.vat === "Reverse charge", contact: { name: me.name, email: me.email },
    };
    const problems = checkInvoiceDoc(docInput);
    if (problems.length) {
      await sql`update invoices set status = 'failed', note = ${problems.join(" ")} where id = ${reserved.id}`;
      return { ok: false, message: "A few things need fixing first.", problems };
    }
    await sql`
      update invoices set type = ${f.type}, stage_label = ${f.stageLabel}, vat_treatment = ${f.vat}, cis = ${f.cis}, invoice_date = ${f.invoiceDate}, supply_date = ${f.supplyDate},
        terms_days = ${f.termsDays}, due_date = ${due}, client_name = ${f.clientName}, client_email = ${f.clientEmail}, billing_address = ${f.billingAddress}, site = ${f.site},
        lines = ${sql.json(f.lines)}, net = ${t.net}, vat = ${t.vat}, gross = ${t.gross}, cis_labour = ${t.cisLabour}, cis_deduction = ${t.cisDeduction}, payable = ${t.payable}
      where id = ${reserved.id}`;

    const folder = await quarterFolder(me.email, places.root, f.supplyDate, f.cis);
    const name = `${label} – ${f.clientName} – ${(job.site || "Job").replace(/[\\/]+/g, "-")}`;
    const copy = await google<{ id: string; webViewLink?: string }>(me.email, `/drive/v3/files/${await templateId("invoice")}/copy`, {
      method: "POST",
      query: { supportsAllDrives: true, fields: "id,webViewLink" },
      body: { name, parents: [folder] },
    });
    docUrl = copy.webViewLink ?? `https://docs.google.com/document/d/${copy.id}/edit`;
    await sql`update invoices set doc_id = ${copy.id}, doc_url = ${docUrl} where id = ${reserved.id}`;

    await batch(me.email, copy.id, invoiceStructurePass(await getDoc(me.email, copy.id), docInput));
    await batch(me.email, copy.id, invoiceTextPass(await getDoc(me.email, copy.id), docInput));
    const left = leftoverPlaceholders(await getDoc(me.email, copy.id));
    if (left.length) throw new Error(`Unfilled placeholders were left: ${left.join(", ")}.`);
    const pdf = await exportPdf(me.email, copy.id);
    const pages = pdfPageCount(pdf);
    if (pages !== 1) throw new Error(`The PDF came out at ${pages} pages; an invoice must fit on one. Shorten the descriptions or use fewer lines.`);
    const saved = await uploadPdf(me.email, `${name}.pdf`, folder, pdf);
    // A copy in the job's 01 - Quote & Contract folder (skipped for a real job folder in test mode).
    if (job.drive_folder_id) {
      const jobFolder = await quoteFolder(me.email, job.drive_folder_id).catch(() => null);
      if (jobFolder) await uploadPdf(me.email, `${name}.pdf`, jobFolder, pdf);
    }
    await sql`update invoices set pdf_file_id = ${saved.id}, pdf_url = ${saved.url}, status = 'made' where id = ${reserved.id}`;

    // The ledger row. If this fails the invoice still stands; the job shows a button to try again.
    const ledgerProblem = await writeLedgerRow(me.email, places.ledgerId, reserved.id).catch(async (e) => {
      const why = e instanceof Error ? e.message : String(e);
      await sql`update invoices set ledger_error = ${why} where id = ${reserved!.id}`;
      return why;
    });

    // The job's notes and stage (finance--invoicing.md, "Keep the job in step").
    const line = `${ukDate(todayUK())}: ${label} for £${t.gross.toFixed(2)} inc VAT raised (${f.type.toLowerCase()}${f.stageLabel ? `, ${f.stageLabel.toLowerCase()}` : ""}).`;
    await sql`update jobs set notes = case when notes = '' then ${line} else notes || E'\n' || ${line} end, updated_at = now() where id = ${jobId}`;
    if (["Final", "Survey", "Day rate"].includes(f.type) && !["Invoiced", "Paid", "Closed"].includes(job.stage)) {
      await changeStage(jobId, "Invoiced", me.email);
      await syncJobFolder(jobId, me.email).catch(() => "");
    }
    await audit(sql, me.email, "invoice made", "job", jobId, { invoice: label, net: t.net, gross: t.gross, test: places.test });
    return {
      ok: true, label, docUrl, pdfUrl: saved.url, invoiceId: reserved.id,
      message: `${label} made: ${t.gross.toLocaleString("en-GB", { style: "currency", currency: "GBP" })}${f.cis ? `, ${t.payable.toLocaleString("en-GB", { style: "currency", currency: "GBP" })} payable after CIS` : " inc VAT"}.${ledgerProblem ? ` It wasn't added to the ledger: ${ledgerProblem}` : ` Added to the ${places.test ? "test copy of the " : ""}ledger.`} Read the PDF through before sending.`,
    };
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    if (reserved) await sql`update invoices set status = 'failed', note = ${why} where id = ${reserved.id} and status = 'started'`;
    return { ok: false, docUrl, message: `The invoice wasn't made. ${why}${reserved ? " Its number will be used for the next one, so there's no gap." : ""}` };
  }
}

/** Adds the invoice to the ledger's Invoices tab, in the first empty row (formulas are already filled down to row 501). */
export async function writeLedgerRow(email: string, ledgerId: string, invoiceId: string): Promise<string> {
  const [i] = await sql<{ number: number; test: boolean; invoice_date: string; supply_date: string; client_name: string; client_email: string; site: string; type: InvoiceType; vat_treatment: VatTreatment; net: number; cis: boolean; cis_labour: number | null; terms_days: number; pdf_url: string; stage_label: string; ledger_row: number | null; job_id: string | null }[]>`
    select number, test, invoice_date, supply_date, client_name, client_email, site, type, vat_treatment, net, cis, cis_labour, terms_days, pdf_url, stage_label, ledger_row, job_id from invoices where id = ${invoiceId}`;
  if (i.ledger_row) return "";
  const [job] = i.job_id ? await sql<{ number: number | null; legacy_ref: string }[]>`select number, legacy_ref from jobs where id = ${i.job_id}` : [];
  const label = invoiceLabel(i.number, i.test);
  const colA = await readColumn(email, ledgerId, "Invoices!A2:A501");
  if (colA.includes(label)) throw new Error(`${label} is already in the ledger.`);
  const empty = colA.findIndex((v) => v.trim() === "");
  const row = (empty === -1 ? colA.length : empty) + 2;
  if (row > 501) throw new Error("The ledger's Invoices tab is full (row 501). Extend its formulas first.");
  const writes = ledgerRow({
    number: label, invoiceDate: i.invoice_date, supplyDate: i.supply_date, client: i.client_name, clientEmail: i.client_email,
    quoteRef: job ? (job.number ? String(job.number) : job.legacy_ref) : "", site: i.site, type: i.type, vat: i.vat_treatment, net: i.net,
    cisLabour: i.cis ? i.cis_labour : null, termsDays: i.terms_days, pdfUrl: i.pdf_url, notes: i.stage_label ? `${i.stage_label}. Made by the Job Hub.` : "Made by the Job Hub.",
  });
  await google(email, `${SHEETS}/v4/spreadsheets/${ledgerId}/values:batchUpdate`, {
    method: "POST",
    body: { valueInputOption: "USER_ENTERED", data: writes.map((w) => ({ range: w.range(row), values: [w.values] })) },
  });
  await sql`update invoices set ledger_row = ${row}, ledger_error = '' where id = ${invoiceId}`;
  return "";
}

/** Fills the ledger's Sent Date or Paid Date for an invoice, and the app's own record. */
export async function markInvoice(invoiceId: string, what: "sent" | "paid", date: string, me: { email: string }) {
  const [i] = await sql<{ number: number; test: boolean; ledger_row: number | null; status: string; job_id: string | null; type: string }[]>`
    select number, test, ledger_row, status, job_id, type from invoices where id = ${invoiceId}`;
  if (!i || !["made", "sent", "paid"].includes(i.status)) throw new Error("That invoice isn't made yet.");
  const places = await invoicePlaces(me.email);
  if (places.test !== i.test) throw new Error(`That's a ${i.test ? "test" : "real"} invoice; switch Google to ${i.test ? "test" : "live"} mode in Settings to change it.`);
  if (i.ledger_row) {
    const [a] = await readColumn(me.email, places.ledgerId, `Invoices!A${i.ledger_row}`);
    if (a !== invoiceLabel(i.number, i.test)) throw new Error(`Row ${i.ledger_row} of the ledger isn't ${invoiceLabel(i.number, i.test)} any more. Fix the ledger by hand.`);
    await google(me.email, `${SHEETS}/v4/spreadsheets/${places.ledgerId}/values/${encodeURIComponent(`Invoices!${what === "sent" ? "R" : "S"}${i.ledger_row}`)}`, {
      method: "PUT", query: { valueInputOption: "USER_ENTERED" }, body: { values: [[ukDate(date)]] },
    });
  }
  if (what === "sent") await sql`update invoices set sent_date = ${date}, status = case when status = 'made' then 'sent' else status end where id = ${invoiceId}`;
  else await sql`update invoices set paid_date = ${date}, status = 'paid' where id = ${invoiceId}`;
  await audit(sql, me.email, `invoice ${what}`, "job", i.job_id ?? "", { invoice: invoiceLabel(i.number, i.test), date });
  // A final, survey or day-rate invoice paid with nothing else outstanding: the job is Paid (finance--chasing-and-payments.md).
  if (what === "paid" && i.job_id && ["Final", "Survey", "Day rate"].includes(i.type)) {
    const [{ open }] = await sql<{ open: number }[]>`select count(*)::int as open from invoices where job_id = ${i.job_id} and test = ${i.test} and status in ('made', 'sent')`;
    if (open === 0) {
      await changeStage(i.job_id, "Paid", me.email);
      await syncJobFolder(i.job_id, me.email).catch(() => "");
      return "The job is now Paid and its folder has moved to Completed. Certificates can be released.";
    }
  }
  return "";
}

export async function jobInvoices(jobId: string) {
  return (await sql<{ id: string; number: number; test: boolean; type: string; stage_label: string; vat_treatment: string; cis: boolean; net: number; gross: number; payable: number; status: string; invoice_date: string; due_date: string; sent_date: string | null; paid_date: string | null; doc_url: string; pdf_url: string; ledger_row: number | null; note: string; client_email: string }[]>`
    select id, number, test, type, stage_label, vat_treatment, cis, net, gross, payable, status, invoice_date, due_date, sent_date, paid_date, doc_url, pdf_url, ledger_row, note, client_email
    from invoices where job_id = ${jobId} and status <> 'started' order by test, number`).map((r) => ({ ...r }));
}

export async function retryLedger(invoiceId: string, me: { email: string }) {
  const [i] = await sql<{ test: boolean }[]>`select test from invoices where id = ${invoiceId} and status in ('made', 'sent', 'paid')`;
  if (!i) throw new Error("That invoice isn't made yet.");
  const places = await invoicePlaces(me.email);
  if (places.test !== i.test) throw new Error("Switch Google to the mode the invoice was made in, then try again.");
  try {
    await writeLedgerRow(me.email, places.ledgerId, invoiceId);
  } catch (e) {
    await sql`update invoices set ledger_error = ${errorText(e)} where id = ${invoiceId}`;
    throw e;
  }
}
