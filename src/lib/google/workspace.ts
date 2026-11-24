import "server-only";
/**
 * The assistant's hands in Google Workspace beyond moving files: editing a Doc's wording, saving a Doc as a PDF,
 * making folders, copying files, writing cells in a job's spreadsheet, opening and filing email attachments, and
 * drafting any email. Same rules as drive-actions.ts: Batt's shared drive only, never the templates, the ledger or
 * the stage folders, test folders only in test mode, everything in the audit log. Emails are drafts, never sent.
 */
import { sql } from "../db";
import { audit } from "../mutations";
import { pdfPageCount } from "../docs";
import type { Attachment } from "../email";
import { DOCS, SHEETS, google, googleFetch, GoogleError, gmailMailboxes } from "./client";
import { allowed, chain, get, ground, type Item } from "./drive-actions";
import { createDraft } from "./gmail";

const FOLDER = "application/vnd.google-apps.folder";
const DOC = "application/vnd.google-apps.document";
const SHEET = "application/vnd.google-apps.spreadsheet";
const SLIDES = "application/vnd.google-apps.presentation";
const ALL = { supportsAllDrives: true } as const;
const GMAIL = "/gmail/v1/users/me";
const MAX_ATTACH_MB = 20;

const link = (f: { id: string; webViewLink?: string }) => f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`;

/** A folder the assistant may put things in: inside the shared drive, and inside the test folders in test mode. */
async function targetFolder(email: string, folderId: string) {
  const gr = await ground(email);
  const f = await get(email, folderId);
  if (f.mimeType !== FOLDER) throw new Error(`"${f.name}" isn't a folder.`);
  if (f.driveId !== gr.driveId) throw new Error(`"${f.name}" isn't in Batt's shared drive.`);
  const above = await chain(email, f);
  if (gr.mode === "test" && !gr.testRoots.includes(f.id) && !above.some((a) => gr.testRoots.includes(a.id))) throw new Error("The app is in test mode, so things can only be put in the test folders.");
  return { folder: f, path: [...above.map((a) => a.name).reverse(), f.name].join(" › "), gr };
}

// ---------- Google Docs ----------

/** Changes wording in a Google Doc: every place `find` appears becomes `replace`. Says how many places each changed. */
export async function docEdit(me: { email: string }, fileId: string, changes: { find: string; replace: string }[]) {
  const gr = await ground(me.email);
  const { item, path } = await allowed(me.email, fileId, gr, "edited");
  if (item.mimeType !== DOC) throw new Error(`"${item.name}" isn't a Google Doc, so its wording can't be changed here.`);
  const r = await google<{ replies?: { replaceAllText?: { occurrencesChanged?: number } }[] }>(me.email, `${DOCS}/v1/documents/${item.id}:batchUpdate`, {
    method: "POST",
    body: { requests: changes.map((c) => ({ replaceAllText: { containsText: { text: c.find, matchCase: true }, replaceText: c.replace } })) },
  });
  const done = changes.map((c, i) => ({ find: c.find, replace: c.replace, places_changed: r.replies?.[i]?.replaceAllText?.occurrencesChanged ?? 0 }));
  await audit(sql, me.email, "Doc edited (assistant)", "drive", item.id, { name: item.name, in: path, changes: done });
  const missed = done.filter((d) => d.places_changed === 0);
  return { name: item.name, link: link(item), changes: done, ...(missed.length ? { not_found: missed.map((m) => m.find), note: "Text marked not found wasn't in the document exactly as given (check capitals, spaces and line breaks). Read the Doc and try again with the exact wording." } : {}) };
}

export async function uploadFile(email: string, name: string, mimeType: string, folderId: string, bytes: Uint8Array) {
  const boundary = `batt${Date.now()}`;
  const meta = JSON.stringify({ name, parents: [folderId], mimeType });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: ${mimeType}\r\n\r\n`),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await googleFetch(email, "/upload/drive/v3/files", { method: "POST", query: { uploadType: "multipart", supportsAllDrives: true, fields: "id,webViewLink" }, headers: { "content-type": `multipart/related; boundary=${boundary}` }, body });
  const data = (await res.json().catch(() => ({}))) as { id?: string; webViewLink?: string; error?: { message?: string } };
  if (!res.ok || !data.id) throw new GoogleError(`Google wouldn't save the file: ${data.error?.message ?? res.status}`, res.status);
  return { id: data.id, url: data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view` };
}

/**
 * Saves a Google Doc as a PDF beside it. If a PDF of the same name is already there it is updated in place, so its
 * link stays the same. If the Doc is a quote the app made, the job's quote PDF is pointed at the new one.
 */
export async function docToPdf(me: { email: string }, fileId: string) {
  const gr = await ground(me.email);
  const { item, path } = await allowed(me.email, fileId, gr, "saved as a PDF");
  if (item.mimeType !== DOC && item.mimeType !== SHEET && item.mimeType !== SLIDES) throw new Error(`"${item.name}" isn't a Google Doc, Sheet or Slides file.`);
  const res = await googleFetch(me.email, `/drive/v3/files/${item.id}/export`, { query: { mimeType: "application/pdf" } });
  if (!res.ok) throw new GoogleError(`Google couldn't make the PDF (error ${res.status}).`, res.status);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const parent = item.parents![0];
  const name = `${item.name}.pdf`;
  const siblings = await google<{ files: Item[] }>(me.email, "/drive/v3/files", {
    query: { ...ALL, includeItemsFromAllDrives: true, corpora: "drive", driveId: gr.driveId, fields: "files(id,name,mimeType,webViewLink)", q: `'${parent}' in parents and trashed = false and mimeType = 'application/pdf'` },
  });
  const existing = (siblings.files ?? []).find((f) => f.name === name);
  let saved: { id: string; url: string };
  if (existing) {
    const up = await googleFetch(me.email, `/upload/drive/v3/files/${existing.id}`, { method: "PATCH", query: { uploadType: "media", supportsAllDrives: true, fields: "id" }, headers: { "content-type": "application/pdf" }, body: Buffer.from(bytes) });
    if (!up.ok) throw new GoogleError(`Google wouldn't update the PDF (error ${up.status}).`, up.status);
    saved = { id: existing.id, url: link(existing) };
  } else {
    saved = await uploadFile(me.email, name, "application/pdf", parent, bytes);
  }
  const pages = pdfPageCount(bytes);
  const quote = await sql`update documents set pdf_file_id = ${saved.id}, pdf_url = ${saved.url}, pages = ${pages}, note = '' where doc_id = ${item.id} and kind = 'quote' returning id`;
  await audit(sql, me.email, "PDF saved from Doc (assistant)", "drive", item.id, { name, in: path, pages, updated: Boolean(existing) });
  return { pdf: name, link: saved.url, pages, in: path, ...(existing ? { note: "The PDF that was already there has been updated, so its link is the same." } : {}), ...(quote.length ? { job_quote_updated: true } : {}) };
}

// ---------- Drive ----------

export async function driveMakeFolder(me: { email: string }, name: string, parent: { folderId?: string; area?: string }) {
  const gr = await ground(me.email);
  const parentId = parent.folderId ?? (parent.area ? gr.areas[parent.area] : undefined);
  if (!parentId) throw new Error("Say where the folder goes: a folder id, or one of Live, Lost, Active, Completed.");
  const { folder, path } = await targetFolder(me.email, parentId);
  const clean = name.replace(/[\\/]+/g, "-").trim();
  if (!clean) throw new Error("Give the folder a name.");
  const kids = await google<{ files: Item[] }>(me.email, "/drive/v3/files", {
    query: { ...ALL, includeItemsFromAllDrives: true, corpora: "drive", driveId: gr.driveId, fields: "files(id,name,webViewLink)", q: `'${folder.id}' in parents and trashed = false and mimeType = '${FOLDER}'` },
  });
  const there = (kids.files ?? []).find((f) => f.name === clean);
  if (there) return { made: false, id: there.id, name: clean, in: path, link: link(there), note: "A folder with that name was already there." };
  const f = await google<Item>(me.email, "/drive/v3/files", { method: "POST", query: { ...ALL, fields: "id,name,webViewLink" }, body: { name: clean, mimeType: FOLDER, parents: [folder.id] } });
  await audit(sql, me.email, "Drive: folder made (assistant)", "drive", f.id, { name: clean, in: path });
  return { made: true, id: f.id, name: clean, in: path, link: link(f) };
}

/** Copies a file (a template, an old quote, a drawing) into a folder. The original is left as it is. */
export async function driveCopy(me: { email: string }, fileId: string, toFolderId: string, name?: string) {
  const gr = await ground(me.email);
  const src = await get(me.email, fileId);
  if (src.driveId !== gr.driveId) throw new Error(`"${src.name}" isn't in Batt's shared drive.`);
  if (src.mimeType === FOLDER) throw new Error("A whole folder can't be copied. Copy the files in it, or move the folder.");
  const { folder, path } = await targetFolder(me.email, toFolderId);
  const f = await google<Item>(me.email, `/drive/v3/files/${encodeURIComponent(src.id)}/copy`, { method: "POST", query: { ...ALL, fields: "id,name,webViewLink" }, body: { name: name?.trim() || src.name, parents: [folder.id] } });
  await audit(sql, me.email, "Drive: copied (assistant)", "drive", f.id, { from: src.name, to: path, name: f.name });
  return { copied: true, id: f.id, name: f.name, in: path, link: link(f) };
}

// ---------- Google Sheets ----------

/** Writes values into a Google Sheet in the shared drive (a job's pricing sheet, a tracker). Never a template or the ledger. */
export async function sheetWrite(me: { email: string }, fileId: string, range: string, values: (string | number | boolean)[][]) {
  const gr = await ground(me.email);
  const { item, path } = await allowed(me.email, fileId, gr, "written to");
  if (item.mimeType !== SHEET) throw new Error(`"${item.name}" isn't a Google Sheet.`);
  if (!/^('[^']+'|[A-Za-z0-9 _-]+)![A-Z]+[0-9]+(:[A-Z]+[0-9]+)?$/.test(range.trim())) throw new Error("Give the range as Tab!A1 or Tab!A1:C3.");
  const r = await google<{ updatedCells?: number }>(me.email, `${SHEETS}/v4/spreadsheets/${item.id}/values/${encodeURIComponent(range.trim())}`, { method: "PUT", query: { valueInputOption: "USER_ENTERED" }, body: { values } });
  await audit(sql, me.email, "Sheet written (assistant)", "drive", item.id, { name: item.name, in: path, range, cells: r.updatedCells ?? 0 });
  return { name: item.name, range: range.trim(), cells_written: r.updatedCells ?? 0, link: link(item) };
}

// ---------- Email attachments ----------

type Part = { mimeType?: string; filename?: string; body?: { data?: string; size?: number; attachmentId?: string }; parts?: Part[] };
export type MailFile = { name: string; mimeType: string; data: Buffer };

async function mailbox(me: { email: string }, box?: string) {
  const b = box?.trim().toLowerCase();
  if (!b || b === me.email.toLowerCase()) return me.email;
  if (!(await gmailMailboxes()).map((m) => m.toLowerCase()).includes(b)) throw new Error(`${box} isn't a connected mailbox.`);
  return b;
}

/** The attachments on a thread, newest message first. With `name`, the one whose file name contains it. */
export async function threadAttachments(me: { email: string }, threadId: string, opts: { mailbox?: string; name?: string; download?: boolean } = {}) {
  const box = await mailbox(me, opts.mailbox);
  const t = await google<{ messages?: { id: string; payload?: Part }[] }>(box, `${GMAIL}/threads/${encodeURIComponent(threadId)}`, { query: { format: "full" } });
  const found: { messageId: string; name: string; mimeType: string; sizeKb: number; attachmentId?: string; data?: string }[] = [];
  for (const m of [...(t.messages ?? [])].reverse()) {
    const walk = (p: Part) => {
      if (p.filename) found.push({ messageId: m.id, name: p.filename, mimeType: p.mimeType ?? "application/octet-stream", sizeKb: Math.round((p.body?.size ?? 0) / 1024), attachmentId: p.body?.attachmentId, data: p.body?.data });
      p.parts?.forEach(walk);
    };
    walk(m.payload ?? {});
  }
  const want = opts.name?.trim().toLowerCase();
  const list = want ? found.filter((f) => f.name.toLowerCase().includes(want)) : found;
  if (!opts.download) return { box, list: list.map(({ name, mimeType, sizeKb }) => ({ name, mimeType, sizeKb })), files: [] as MailFile[] };
  const one = list[0];
  if (!one) throw new Error(want ? `There's no attachment with "${opts.name}" in its name on that email. The attachments are: ${found.map((f) => f.name).join(", ") || "none"}.` : "That email has no attachments.");
  if (one.sizeKb / 1024 > MAX_ATTACH_MB) throw new Error(`${one.name} is ${Math.round(one.sizeKb / 1024)} MB, which is too big to open here.`);
  const data = one.data ?? (await google<{ data: string }>(box, `${GMAIL}/messages/${encodeURIComponent(one.messageId)}/attachments/${encodeURIComponent(one.attachmentId ?? "")}`)).data;
  return { box, list: list.map(({ name, mimeType, sizeKb }) => ({ name, mimeType, sizeKb })), files: [{ name: one.name, mimeType: one.mimeType, data: Buffer.from(data, "base64url") }] };
}

/** Files an email attachment into a Drive folder (an enquiry's drawings into the job's 02 folder, say). */
export async function attachmentToDrive(me: { email: string }, threadId: string, name: string, toFolderId: string, mailboxName?: string) {
  const { folder, path } = await targetFolder(me.email, toFolderId);
  const { files } = await threadAttachments(me, threadId, { mailbox: mailboxName, name, download: true });
  const f = files[0];
  const saved = await uploadFile(me.email, f.name, f.mimeType === "application/octet-stream" && /\.pdf$/i.test(f.name) ? "application/pdf" : f.mimeType, folder.id, f.data);
  await audit(sql, me.email, "Email attachment filed (assistant)", "drive", saved.id, { name: f.name, in: path });
  return { filed: true, name: f.name, in: path, link: saved.url, id: saved.id };
}

// ---------- Any email, as a draft ----------

/** Drive files to attach: PDFs and pictures as they are, Google Docs, Sheets and Slides as PDFs. */
async function driveAttachments(email: string, fileIds: string[]): Promise<Attachment[]> {
  const gr = await ground(email);
  const out: Attachment[] = [];
  let total = 0;
  for (const id of fileIds) {
    const f = await get(email, id);
    if (f.driveId !== gr.driveId) throw new Error(`"${f.name}" isn't in Batt's shared drive, so it can't be attached.`);
    if (f.mimeType === FOLDER) throw new Error(`"${f.name}" is a folder. Attach the files in it.`);
    const google_ = [DOC, SHEET, SLIDES].includes(f.mimeType);
    const res = google_
      ? await googleFetch(email, `/drive/v3/files/${f.id}/export`, { query: { mimeType: "application/pdf" } })
      : await googleFetch(email, `/drive/v3/files/${f.id}`, { query: { alt: "media", supportsAllDrives: true } });
    if (!res.ok) throw new GoogleError(`Google wouldn't send "${f.name}" (${res.status}).`, res.status);
    const data = Buffer.from(await res.arrayBuffer());
    total += data.length;
    if (total > MAX_ATTACH_MB * 1024 * 1024) throw new Error(`Those attachments come to more than ${MAX_ATTACH_MB} MB. Send a link to the folder instead.`);
    out.push({ name: (google_ ? `${f.name}.pdf` : f.name).replace(/\//g, "-"), mimeType: google_ ? "application/pdf" : f.mimeType, data });
  }
  return out;
}

/** Saves any email in the person's own Gmail drafts, with files from Drive attached if asked. Never sends. */
export async function draftEmail(me: { email: string; name: string }, e: { to: string; cc: string; subject: string; body: string; attachFileIds: string[] }) {
  if (!e.subject.trim()) throw new Error("Give the email a subject.");
  if (!e.body.trim()) throw new Error("The email has no wording.");
  const attachments = await driveAttachments(me.email, e.attachFileIds);
  const d = await createDraft(me.email, { to: e.to, cc: e.cc, subject: e.subject.trim(), body: e.body, attachments, allowNoTo: true });
  await audit(sql, me.email, "email drafted (assistant)", "email", d.draftId, { to: e.to, subject: e.subject, attachments: attachments.map((a) => a.name) });
  return { drafted: true, to: e.to, attached: attachments.map((a) => a.name), link: d.url, note: "Saved in Gmail drafts, not sent. The user checks it and presses Send." };
}
