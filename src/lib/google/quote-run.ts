import "server-only";
import { quoteRef } from "./format";
import { sql } from "../db";
import { audit } from "../mutations";
import { leftoverPlaceholders, pdfPageCount, type Doc, type Request } from "../docs";
import * as shortForm from "../quote-short";
import type { ShortQuote } from "../quote-short";
import { DOCS, errorText, google, googleFetch, GoogleError } from "./client";
import { quoteFolder, templateId } from "./pricing-run";

export const getDoc = (email: string, id: string) => google<Doc>(email, `${DOCS}/v1/documents/${id}`);
export const batch = async (email: string, id: string, requests: Request[]) => {
  if (requests.length) await google(email, `${DOCS}/v1/documents/${id}:batchUpdate`, { method: "POST", body: { requests } });
};

/** Saves bytes as a new file in a Drive folder. */
export async function uploadPdf(email: string, name: string, folderId: string, bytes: Uint8Array) {
  const boundary = `batt${Date.now()}`;
  const meta = JSON.stringify({ name, parents: [folderId], mimeType: "application/pdf" });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: application/pdf\r\n\r\n`),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await googleFetch(email, "/upload/drive/v3/files", {
    method: "POST",
    query: { uploadType: "multipart", supportsAllDrives: true, fields: "id,webViewLink" },
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; webViewLink?: string; error?: { message?: string } };
  if (!res.ok || !data.id) throw new GoogleError(`Google wouldn't save the PDF: ${data.error?.message ?? res.status}`, res.status);
  return { id: data.id, url: data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view` };
}

export async function exportPdf(email: string, docId: string) {
  const res = await googleFetch(email, `/drive/v3/files/${docId}/export`, { query: { mimeType: "application/pdf" } });
  if (!res.ok) throw new GoogleError(`Google couldn't make the PDF (error ${res.status}).`, res.status);
  return new Uint8Array(await res.arrayBuffer());
}

export type QuoteOutcome = { ok: boolean; message: string; problems?: string[]; docUrl?: string; pdfUrl?: string; pages?: number };

/** What every quote template needs: its checks and its three passes. */
export type Filler<Q extends { number: number; total: number; ref?: string }> = {
  template: "quoteShort" | "quoteLong" | "surveyProposal";
  label: string; // "Quote", "Survey Proposal"
  check: (q: Q) => string[];
  captureStyles: (doc: Doc) => unknown;
  structurePass: (doc: Doc, q: Q) => Request[];
  textPass: (doc: Doc, q: Q) => Request[];
  stylePass: (doc: Doc, q: Q, styles: never) => Request[];
  minPages: number;
};

export const SHORT_FORM: Filler<ShortQuote> = {
  template: "quoteShort",
  label: "Quote",
  check: shortForm.checkShortQuote,
  captureStyles: shortForm.captureRowStyles,
  structurePass: shortForm.structurePass,
  textPass: shortForm.textPass,
  stylePass: shortForm.stylePass as never,
  minPages: 3,
};

import * as longForm from "../quote-long";
import type { LongQuote } from "../quote-long";

export const LONG_FORM: Filler<LongQuote> = {
  template: "quoteLong",
  label: "Quote",
  check: longForm.checkLongQuote,
  captureStyles: longForm.captureLongStyles,
  structurePass: longForm.longStructurePass,
  textPass: longForm.longTextPass,
  stylePass: longForm.longStylePass as never,
  minPages: 5,
};

/**
 * keep: leave the job's earlier quotes in place (for a second option the client chooses between). Otherwise a new
 * quote replaces the old one. label: added to the file name, e.g. "Option 2".
 */
export type QuoteOptions = { keep?: boolean; label?: string };

export const buildLongQuote = (jobId: string, q: LongQuote, me: { email: string; name: string }, o: QuoteOptions = {}) => buildDocument(jobId, LONG_FORM, q, me, o);

export const buildShortQuote = (jobId: string, q: ShortQuote, me: { email: string; name: string }, o: QuoteOptions = {}) => buildDocument(jobId, SHORT_FORM, q, me, o);

/** Puts the job's earlier quote documents and PDFs in Drive's bin (Google keeps them 30 days) and takes them off the job. */
async function replaceEarlierQuotes(jobId: string, keepId: string, email: string): Promise<number> {
  const old = await sql<{ id: string; doc_id: string; pdf_file_id: string }[]>`
    select id, doc_id, pdf_file_id from documents where job_id = ${jobId} and kind = 'quote' and id <> ${keepId} and note not like 'Replaced%'`;
  for (const d of old) {
    for (const fileId of [d.doc_id, d.pdf_file_id].filter(Boolean)) {
      // Already gone or moved by hand is fine: the aim is only that the old version can't be sent by mistake.
      await google(email, `/drive/v3/files/${encodeURIComponent(fileId)}`, { method: "PATCH", query: { supportsAllDrives: true, fields: "id" }, body: { trashed: true } }).catch(() => null);
    }
    await sql`update documents set note = 'Replaced by a newer version (in Drive''s bin)', pdf_url = '', pdf_file_id = '' where id = ${d.id}`;
  }
  return old.length;
}

/**
 * Makes a quote or proposal: copies the template into the job's 01 folder, fills it in three
 * passes (each on a fresh read), checks nothing in square brackets is left, then saves a PDF beside it.
 */
export async function buildDocument<Q extends { number: number; total: number; ref?: string }>(
  jobId: string,
  filler: Filler<Q>,
  asked: Q,
  me: { email: string; name: string },
  options: QuoteOptions = {},
): Promise<QuoteOutcome> {
  let q = asked;
  const problems = filler.check(q);
  if (problems.length) return { ok: false, message: "A few things need fixing before the document can be made.", problems };
  let docUrl = "";
  try {
    const [job] = await sql<{ number: number | null; site: string; client: string | null; drive_folder_id: string }[]>`
      select j.number, j.site, c.name as client, j.drive_folder_id from jobs j left join clients c on c.id = j.client_id where j.id = ${jobId}`;
    if (!job?.number) return { ok: false, message: "Price the job first: that gives it its number and Drive folder." };
    if (job.number !== q.number) return { ok: false, message: "The job's number has changed. Reload the page and try again." };
    if (!job.drive_folder_id) return { ok: false, message: "The job has no Drive folder yet. Open its Files tab and create it." };
    const folder = await quoteFolder(me.email, job.drive_folder_id);
    if (!folder) return { ok: false, message: "This job's Drive folder is a real one and the app is in test mode, so nothing was saved to it." };

    // The client always sees the plain job number. The revision is only counted inside the app.
    const [{ n }] = await sql<{ n: number }[]>`select coalesce(max(revision), 0)::int as n from documents where job_id = ${jobId} and kind = 'quote'`;
    const revision = n + 1;
    const ref = quoteRef(job.number, revision);
    q = { ...q, ref };
    const label = options.label?.replace(/[\\/]+/g, "-").trim();
    const name = `${ref} – ${(job.site || job.client || "Job").replace(/[\\/]+/g, "-")} – ${filler.label}${label ? ` – ${label}` : ""}`;

    const copy = await google<{ id: string; webViewLink?: string }>(me.email, `/drive/v3/files/${await templateId(filler.template)}/copy`, {
      method: "POST",
      query: { supportsAllDrives: true, fields: "id,webViewLink" },
      body: { name, parents: [folder] },
    });
    docUrl = copy.webViewLink ?? `https://docs.google.com/document/d/${copy.id}/edit`;
    const [docRow] = await sql<{ id: string }[]>`
      insert into documents (job_id, kind, revision, name, doc_id, url, created_by, note)
      values (${jobId}, 'quote', ${revision}, ${name}, ${copy.id}, ${docUrl}, ${me.email}, 'Started, not finished') returning id`;

    const fresh = await getDoc(me.email, copy.id);
    const styles = filler.captureStyles(fresh);
    await batch(me.email, copy.id, filler.structurePass(fresh, q));
    await batch(me.email, copy.id, filler.textPass(await getDoc(me.email, copy.id), q));
    await batch(me.email, copy.id, filler.stylePass(await getDoc(me.email, copy.id), q, styles as never));

    const finished = await getDoc(me.email, copy.id);
    const leftovers = leftoverPlaceholders(finished);
    if (leftovers.length) {
      await sql`update documents set note = ${`Placeholders left: ${leftovers.join(", ")}`} where id = ${docRow.id}`;
      return { ok: false, docUrl, message: `The document still has unfilled placeholders: ${leftovers.join(", ")}. No PDF was made. Open the document to see.` };
    }

    const pdf = await exportPdf(me.email, copy.id);
    const pages = pdfPageCount(pdf);
    if (pages < filler.minPages) {
      await sql`update documents set note = ${`PDF has ${pages} pages`} where id = ${docRow.id}`;
      return { ok: false, docUrl, message: `The PDF came out at ${pages} page${pages === 1 ? "" : "s"}, which is too short. No PDF was saved. Open the document to check it.` };
    }
    const saved = await uploadPdf(me.email, `${name}.pdf`, folder, pdf);
    await sql`update documents set pdf_file_id = ${saved.id}, pdf_url = ${saved.url}, pages = ${pages}, note = '' where id = ${docRow.id}`;
    await sql`update jobs set quote_draft = ${sql.json({ template: filler.template, ...q } as never)}, updated_at = now() where id = ${jobId}`;
    // The client only ever sees one quote for the job: the earlier version goes to Drive's bin unless it's being kept as an option.
    const replaced = options.keep ? 0 : await replaceEarlierQuotes(jobId, docRow.id, me.email);
    await audit(sql, me.email, "quote made", "job", jobId, { template: filler.template, revision, docId: copy.id, pdfId: saved.id, total: q.total, pages, replaced });
    return {
      ok: true,
      docUrl,
      pdfUrl: saved.url,
      pages,
      message: `${filler.label} ${ref} saved to the job's folder: ${pages} pages, ${q.total.toLocaleString("en-GB", { style: "currency", currency: "GBP" })} inc VAT.${replaced ? ` It replaces the earlier version, which is in Drive's bin.` : ""} Open the PDF and read it through before sending.`,
    };
  } catch (e) {
    return { ok: false, docUrl, message: `The document wasn't finished. ${errorText(e)}${docUrl ? " What was done so far is in the job's folder." : ""}` };
  }
}
