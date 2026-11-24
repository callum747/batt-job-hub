import "server-only";
/** Reminders with their data: which quotes and invoices are due a chase, which jobs have stalled, and drafting a quote chaser. */
import { sql } from "./db";
import { findJob, getClient, jobDocuments, type JobWithMoney } from "./data";
import { firstName, findEmail } from "./email";
import { jobLabel, todayUK, ukDate } from "./jobs-rules";
import { audit } from "./mutations";
import { quoteChase, quoteChaserEmail, stuckReason } from "./reminders";
import { quoteEmailStart, type DraftOutcome } from "./quote-email";
import { createDraft, driveFileBytes } from "./google/gmail";
import { errorText } from "./google/client";
import { quoteRef } from "./google/format";

export type QuoteReminder = { id: string; label: string; href: string; client: string; site: string; value: number; quotedAt: string; lastChased: string | null; chases: number; daysSinceSent: number };
export type StuckReminder = { id: string; label: string; href: string; client: string; site: string; stage: string; why: string };

async function chaseEvery() {
  const [row] = await sql<{ value: { quoteDays?: number } }[]>`select value from settings where key = 'chase'`;
  return row?.value?.quoteDays && row.value.quoteDays > 0 ? row.value.quoteDays : 7;
}

const href = (j: { number: number | null; id: string }) => `/jobs/${j.number ?? j.id}`;

/** Quotes sent with no answer that are due a chase today, longest waiting first. */
export async function quoteReminders(jobs: JobWithMoney[], today = todayUK()): Promise<QuoteReminder[]> {
  const every = await chaseEvery();
  return jobs
    .map((j) => ({ j, c: quoteChase(j, today, every) }))
    .filter(({ c }) => c.due)
    .map(({ j, c }) => ({ id: j.id, label: jobLabel(j), href: href(j), client: j.client_name ?? "", site: j.site, value: j.quote_value, quotedAt: j.quoted_at!, lastChased: j.quote_chased_at, chases: c.chases, daysSinceSent: c.daysSinceSent ?? 0 }))
    .sort((a, b) => a.quotedAt.localeCompare(b.quotedAt));
}

/** Jobs that have sat in one stage too long. */
export async function stuckReminders(jobs: JobWithMoney[], today = todayUK()): Promise<StuckReminder[]> {
  const future = new Set((await sql<{ job_id: string }[]>`select distinct job_id from visits where job_id is not null and date >= ${today}`).map((r) => r.job_id));
  const out: StuckReminder[] = [];
  for (const j of jobs) {
    const why = stuckReason({ stage: j.stage, updated_at: j.updated_at, received: j.received, end_date: j.end_date, hasFutureVisit: future.has(j.id) }, today);
    if (why) out.push({ id: j.id, label: jobLabel(j), href: href(j), client: j.client_name ?? "", site: j.site, stage: j.stage, why });
  }
  return out;
}

/** Notes that the quote was chased, by email draft or by phone, so the next chase is a week on. */
export async function markQuoteChased(jobId: string, me: { email: string; name: string }, how: string) {
  const line = `${ukDate(todayUK())} ${me.name}: quote chased (${how}).`;
  await sql`update jobs set quote_chased_at = ${todayUK()}, quote_chases = quote_chases + 1,
    notes = case when notes = '' then ${line} else notes || E'\n' || ${line} end, updated_at = now() where id = ${jobId}`;
  await audit(sql, me.email, "quote chased", "job", jobId, { how });
}

/** Saves a chaser for the job's quote in the person's Gmail drafts, with the quote PDF attached again. Never sends. */
export async function draftQuoteChaser(jobRef: string, me: { email: string; name: string }): Promise<DraftOutcome> {
  try {
    const job = await findJob(jobRef);
    if (!job) return { ok: false, message: "That job doesn't exist." };
    if (job.stage !== "Quoted") return { ok: false, message: `${jobLabel(job)} is at ${job.stage}, so there's no quote waiting on an answer.` };
    if (!job.quoted_at) return { ok: false, message: "The job has no date for when the quote was sent. Add it on the job first." };
    const [start, client, docs] = await Promise.all([quoteEmailStart(job, me.email), job.client_id ? getClient(job.client_id) : null, jobDocuments(job.id)]);
    const to = start?.to || client?.email || findEmail(job.contact) || "";
    if (!to) return { ok: false, message: "There's no email address for this client. Add one to the client, or press \"I've chased it\" if you rang them." };
    const doc = docs.find((d) => d.kind === "quote" && d.pdf_url);
    const [file] = doc ? await sql<{ name: string; pdf_file_id: string }[]>`select name, pdf_file_id from documents where id = ${doc.id}` : [];
    const draft = job.quote_draft as unknown as { project?: string; site?: string; siteName?: string } | null;
    const what = [draft?.project, draft?.site ?? draft?.siteName ?? job.site].filter((s) => s && s.trim()).join(" at ");
    const e = quoteChaserEmail({
      ref: doc && job.number ? quoteRef(job.number, doc.revision) : jobLabel(job),
      what, sentOn: job.quoted_at, today: todayUK(), chasesSoFar: job.quote_chases,
      firstName: firstName(client?.contact || job.contact) ?? "", attached: Boolean(file?.pdf_file_id), originalSubject: start?.subject,
    });
    const attachments = file?.pdf_file_id ? [{ name: `${file.name.replace(/\//g, "-")}.pdf`, mimeType: "application/pdf", data: await driveFileBytes(me.email, file.pdf_file_id) }] : [];
    const d = await createDraft(me.email, { to, cc: "", subject: e.subject, body: e.body, attachments });
    await markQuoteChased(job.id, me, `chaser ${e.nth} drafted in Gmail to ${to}, not sent yet`);
    return { ok: true, url: d.url, message: `Chaser ${e.nth} saved in your Gmail drafts to ${to}${attachments.length ? ", with the quote attached" : ""}. Check it and press Send. The next chase is in a week.` };
  } catch (err) {
    return { ok: false, message: errorText(err) };
  }
}
