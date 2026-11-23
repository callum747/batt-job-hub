import "server-only";
/** The covering email for a job's latest quote or survey proposal, saved as a Gmail draft with the PDF attached. */
import { sql } from "./db";
import { getClient, jobDocuments, type JobRow } from "./data";
import { findEmail, quoteEmail } from "./email";
import { audit } from "./mutations";
import { todayUK } from "./jobs-rules";
import { createDraft, driveFileBytes } from "./google/gmail";
import { errorText } from "./google/client";
import { quoteRef } from "./google/format";
import { preparedByFor } from "./quote-drafts";

export type EmailStart = { documentId: string; pdfName: string; pdfUrl: string; to: string; cc: string; subject: string; body: string };

type Saved = { template?: string; number?: number; subtotal?: number; total?: number; project?: string; site?: string; siteName?: string; siteAddress?: string };

/** A first draft of the email for the newest quote that has a PDF, or null if there isn't one yet. */
export async function quoteEmailStart(job: JobRow, email: string): Promise<EmailStart | null> {
  const docs = await jobDocuments(job.id);
  const doc = docs.find((d) => d.kind === "quote" && d.pdf_url);
  const q = job.quote_draft as unknown as Saved | null;
  if (!doc || !q || q.number === undefined || q.total === undefined) return null;
  const [client, sender] = await Promise.all([job.client_id ? getClient(job.client_id) : null, preparedByFor(email)]);
  const survey = q.template === "surveyProposal";
  const { subject, body } = quoteEmail({
    kind: survey ? "survey" : "quote",
    number: q.number,
    ref: quoteRef(q.number, doc.revision),
    project: survey ? "" : (q.project ?? ""),
    site: survey ? (q.siteName ?? q.siteAddress ?? "") : (q.site ?? job.site),
    subtotal: q.subtotal ?? 0,
    total: q.total,
    contact: client?.contact || job.contact,
    sender: sender ?? { name: email, title: "" },
  });
  return {
    documentId: doc.id,
    pdfName: `${doc.name.replace(/\//g, "-")}.pdf`,
    pdfUrl: doc.pdf_url,
    to: client?.email || findEmail(job.contact) || "",
    cc: "",
    subject,
    body,
  };
}

export type DraftOutcome = { ok: boolean; message: string; url?: string };

/** Saves the email in the person's Gmail drafts with the quote PDF attached. Never sends. */
export async function draftQuoteEmail(jobId: string, documentId: string, e: { to: string; cc: string; subject: string; body: string }, me: { email: string; name: string }): Promise<DraftOutcome> {
  try {
    const [doc] = await sql<{ name: string; pdf_file_id: string }[]>`select name, pdf_file_id from documents where id = ${documentId} and job_id = ${jobId} and kind = 'quote'`;
    if (!doc?.pdf_file_id) return { ok: false, message: "That quote has no PDF yet. Make the quote first." };
    if (!e.subject.trim()) return { ok: false, message: "Give the email a subject." };
    const pdf = await driveFileBytes(me.email, doc.pdf_file_id);
    const d = await createDraft(me.email, { to: e.to, cc: e.cc, subject: e.subject.trim(), body: e.body, attachments: [{ name: `${doc.name}.pdf`, mimeType: "application/pdf", data: pdf }] });
    const line = `${todayUK()} ${me.name}: quote email drafted in Gmail to ${e.to.trim()}, not sent yet.`;
    await sql`update jobs set notes = case when notes = '' then ${line} else notes || E'\n' || ${line} end, updated_at = now() where id = ${jobId}`;
    await audit(sql, me.email, "email drafted", "job", jobId, { to: e.to, subject: e.subject, draft: d.draftId });
    return { ok: true, message: "Saved in your Gmail drafts with the PDF attached. Check it and press Send in Gmail.", url: d.url };
  } catch (err) {
    return { ok: false, message: errorText(err) };
  }
}
