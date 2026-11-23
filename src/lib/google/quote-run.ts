import "server-only";
import { sql } from "../db";
import { audit } from "../mutations";
import { leftoverPlaceholders, pdfPageCount, type Doc, type Request } from "../docs";
import { captureRowStyles, checkShortQuote, structurePass, stylePass, textPass, type ShortQuote } from "../quote-short";
import { DOCS, errorText, google, googleFetch, GoogleError } from "./client";
import { quoteFolder, templateId } from "./pricing-run";

const getDoc = (email: string, id: string) => google<Doc>(email, `${DOCS}/v1/documents/${id}`);
const batch = async (email: string, id: string, requests: Request[]) => {
  if (requests.length) await google(email, `${DOCS}/v1/documents/${id}:batchUpdate`, { method: "POST", body: { requests } });
};

/** Saves bytes as a new file in a Drive folder. */
async function uploadPdf(email: string, name: string, folderId: string, bytes: Uint8Array) {
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

async function exportPdf(email: string, docId: string) {
  const res = await googleFetch(email, `/drive/v3/files/${docId}/export`, { query: { mimeType: "application/pdf" } });
  if (!res.ok) throw new GoogleError(`Google couldn't make the PDF (error ${res.status}).`, res.status);
  return new Uint8Array(await res.arrayBuffer());
}

export type QuoteOutcome = { ok: boolean; message: string; problems?: string[]; docUrl?: string; pdfUrl?: string; pages?: number };

/**
 * Makes the quote: copies the short-form template into the job's 01 folder, fills it in three
 * passes, checks nothing in square brackets is left, then saves a PDF beside it.
 */
export async function buildShortQuote(jobId: string, q: ShortQuote, me: { email: string; name: string }): Promise<QuoteOutcome> {
  const problems = checkShortQuote(q);
  if (problems.length) return { ok: false, message: "A few things need fixing before the quote can be made.", problems };
  let docUrl = "";
  try {
    const [job] = await sql<{ number: number | null; site: string; client: string | null; drive_folder_id: string }[]>`
      select j.number, j.site, c.name as client, j.drive_folder_id from jobs j left join clients c on c.id = j.client_id where j.id = ${jobId}`;
    if (!job?.number) return { ok: false, message: "Price the job first: that gives it its number and Drive folder." };
    if (job.number !== q.number) return { ok: false, message: "The job's number has changed. Reload the page and try again." };
    if (!job.drive_folder_id) return { ok: false, message: "The job has no Drive folder yet. Open its Files tab and create it." };
    const folder = await quoteFolder(me.email, job.drive_folder_id);
    if (!folder) return { ok: false, message: "This job's Drive folder is a real one and the app is in test mode, so nothing was saved to it." };

    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from documents where job_id = ${jobId} and kind = 'quote'`;
    const revision = n + 1;
    const name = `${job.number} – ${(job.site || job.client || "Job").replace(/[\\/]+/g, "-")} – Quote${revision > 1 ? ` rev ${revision}` : ""}`;

    const copy = await google<{ id: string; webViewLink?: string }>(me.email, `/drive/v3/files/${await templateId("quoteShort")}/copy`, {
      method: "POST",
      query: { supportsAllDrives: true, fields: "id,webViewLink" },
      body: { name, parents: [folder] },
    });
    docUrl = copy.webViewLink ?? `https://docs.google.com/document/d/${copy.id}/edit`;
    const [docRow] = await sql<{ id: string }[]>`
      insert into documents (job_id, kind, revision, name, doc_id, url, created_by, note)
      values (${jobId}, 'quote', ${revision}, ${name}, ${copy.id}, ${docUrl}, ${me.email}, 'Started, not finished') returning id`;

    // 1. Structure, 2. words, 3. styling, each on a fresh read of the document.
    const fresh = await getDoc(me.email, copy.id);
    const styles = captureRowStyles(fresh);
    await batch(me.email, copy.id, structurePass(fresh, q));
    await batch(me.email, copy.id, textPass(await getDoc(me.email, copy.id), q));
    await batch(me.email, copy.id, stylePass(await getDoc(me.email, copy.id), q, styles));

    const finished = await getDoc(me.email, copy.id);
    const leftovers = leftoverPlaceholders(finished);
    if (leftovers.length) {
      await sql`update documents set note = ${`Placeholders left: ${leftovers.join(", ")}`} where id = ${docRow.id}`;
      return { ok: false, docUrl, message: `The quote still has unfilled placeholders: ${leftovers.join(", ")}. No PDF was made. Open the document to see.` };
    }

    const pdf = await exportPdf(me.email, copy.id);
    const pages = pdfPageCount(pdf);
    if (pages < 3) {
      await sql`update documents set note = ${`PDF has ${pages} pages`} where id = ${docRow.id}`;
      return { ok: false, docUrl, message: `The PDF came out at ${pages} page${pages === 1 ? "" : "s"}, which is too short for a quote. No PDF was saved. Open the document to check it.` };
    }
    const saved = await uploadPdf(me.email, `${name}.pdf`, folder, pdf);
    await sql`update documents set pdf_file_id = ${saved.id}, pdf_url = ${saved.url}, pages = ${pages}, note = '' where id = ${docRow.id}`;
    await sql`update jobs set quote_draft = ${sql.json(q as never)}, updated_at = now() where id = ${jobId}`;
    await audit(sql, me.email, "quote made", "job", jobId, { revision, docId: copy.id, pdfId: saved.id, total: q.total, pages });
    return {
      ok: true,
      docUrl,
      pdfUrl: saved.url,
      pages,
      message: `Quote saved to the job's folder: ${pages} pages, ${q.total.toLocaleString("en-GB", { style: "currency", currency: "GBP" })} inc VAT. Open the PDF and read it through before sending.`,
    };
  } catch (e) {
    return { ok: false, docUrl, message: `The quote wasn't finished. ${errorText(e)}${docUrl ? " What was done so far is in the job's folder." : ""}` };
  }
}
