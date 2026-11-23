import "server-only";
/** The email that goes with an invoice, saved as a Gmail draft with the PDF attached. Never sent. */
import { sql } from "./db";
import { getClient } from "./data";
import { findEmail, invoiceEmail } from "./email";
import { audit } from "./mutations";
import { invoiceLabel, ukDate } from "./invoicing";
import { todayUK } from "./jobs-rules";
import { createDraft, driveFileBytes } from "./google/gmail";
import { errorText } from "./google/client";
import { preparedByFor } from "./quote-drafts";

type Row = { id: string; job_id: string | null; number: number; test: boolean; type: string; stage_label: string; cis: boolean; gross: number; payable: number; due_date: string; client_email: string; pdf_file_id: string; pdf_url: string; status: string; lines: { description: string }[] };

async function load(invoiceId: string): Promise<Row | null> {
  const [r] = await sql<Row[]>`select id, job_id, number, test, type, stage_label, cis, gross, payable, due_date, client_email, pdf_file_id, pdf_url, status, lines from invoices where id = ${invoiceId}`;
  return r ? { ...r } : null;
}

export type InvoiceEmailStart = { to: string; cc: string; subject: string; body: string; pdfName: string; pdfUrl: string };

export async function invoiceEmailStart(invoiceId: string, email: string): Promise<InvoiceEmailStart | null> {
  const i = await load(invoiceId);
  if (!i || !i.pdf_file_id) return null;
  const [job] = i.job_id ? await sql<{ number: number | null; site: string; contact: string; client_id: string | null }[]>`select number, site, contact, client_id from jobs where id = ${i.job_id}` : [];
  const client = job?.client_id ? await getClient(job.client_id) : null;
  const sender = (await preparedByFor(email)) ?? { name: email, title: "" };
  const label = invoiceLabel(i.number, i.test);
  const ref = job?.number ? `quotation ${job.number}` : "the works";
  const covers =
    i.type === "Survey" ? `the survey${job?.site ? ` at ${job.site}` : ""}`
    : i.stage_label ? `${i.stage_label.toLowerCase()} on ${ref}`
    : i.type === "Final" ? `the final account on ${ref}`
    : i.lines[0]?.description ? i.lines[0].description.charAt(0).toLowerCase() + i.lines[0].description.slice(1) : ref;
  const { subject, body } = invoiceEmail({ label, covers, gross: i.gross, payable: i.payable, cis: i.cis, dueDate: ukDate(i.due_date), contact: client?.contact || job?.contact || "", sender });
  return { to: i.client_email || client?.email || findEmail(job?.contact ?? "") || "", cc: "", subject: job?.site ? `${subject} – ${job.site}` : subject, body, pdfName: `${label}.pdf`, pdfUrl: i.pdf_url };
}

export async function draftInvoiceEmail(invoiceId: string, e: { to: string; cc: string; subject: string; body: string }, me: { email: string; name: string }) {
  try {
    const i = await load(invoiceId);
    if (!i?.pdf_file_id) return { ok: false, message: "That invoice has no PDF yet." };
    const label = invoiceLabel(i.number, i.test);
    const pdf = await driveFileBytes(me.email, i.pdf_file_id);
    const d = await createDraft(me.email, { to: e.to, cc: e.cc, subject: e.subject.trim() || `Invoice ${label}`, body: e.body, attachments: [{ name: `${label}.pdf`, mimeType: "application/pdf", data: pdf }] });
    if (i.job_id) {
      const line = `${todayUK()} ${me.name}: ${label} email drafted in Gmail to ${e.to.trim()}, not sent yet.`;
      await sql`update jobs set notes = case when notes = '' then ${line} else notes || E'\n' || ${line} end, updated_at = now() where id = ${i.job_id}`;
      await audit(sql, me.email, "invoice email drafted", "job", i.job_id, { invoice: label, to: e.to });
    }
    return { ok: true, message: "Saved in your Gmail drafts with the PDF attached. When you've sent it, press Mark sent.", url: d.url };
  } catch (err) {
    return { ok: false, message: errorText(err) };
  }
}
