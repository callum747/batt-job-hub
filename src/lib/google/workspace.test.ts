/**
 * The assistant editing a Doc, saving a PDF, filing an attachment and drafting an email, against a pretend Google
 * and a throwaway database. Runs only when TEST_DATABASE_URL is set. It wipes that database.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const ME = { email: "office@battelectrical.com", name: "Office" };
const F = "application/vnd.google-apps.folder";
const DOC = "application/vnd.google-apps.document";
const LIVE = "1nO9zd2wLMahtVCg4WKx9wxuCN7dK5R98";
const TEMPLATE = "1eWmy-Ab51d7VcdUClgJRhowyzS90Hx4FfxV2U_becD8";

type Item = { id: string; name: string; mimeType: string; parents: string[]; driveId?: string; trashed?: boolean; webViewLink?: string };
const drive = new Map<string, Item>();
const put = (id: string, name: string, parent: string, mimeType = F) => drive.set(id, { id, name, mimeType, parents: [parent], driveId: "DRIVE", webViewLink: `https://drive/${id}` });
const calls: { path: string; method: string; body?: unknown }[] = [];
const drafts: { to: string; subject: string; attachments: { name: string; mimeType: string }[]; allowNoTo?: boolean }[] = [];
let uploads = 0;

vi.mock("./gmail", () => ({ createDraft: vi.fn(async (_e: string, x: (typeof drafts)[number]) => (drafts.push(x), { draftId: "dr1", messageId: "m1", url: "https://mail/draft" })) }));
vi.mock("./client", () => ({
  DOCS: "https://docs", SHEETS: "https://sheets",
  GoogleError: class extends Error {},
  gmailMailboxes: async () => ["office@battelectrical.com", "info@battelectrical.com"],
  googleSettings: async () => (await (await import("../db")).sql`select value from settings where key = 'google'`)[0].value,
  google: vi.fn(async (_e: string, p: string, opts: { method?: string; query?: Record<string, string>; body?: Record<string, unknown> } = {}) => {
    calls.push({ path: p, method: opts.method ?? "GET", body: opts.body });
    if (p.endsWith(":batchUpdate")) return { replies: (opts.body!.requests as { replaceAllText: { containsText: { text: string } } }[]).map((r) => ({ replaceAllText: { occurrencesChanged: r.replaceAllText.containsText.text === "#557/6" ? 2 : r.replaceAllText.containsText.text === "not there" ? 0 : 1 } })) };
    if (p.includes("/gmail/") && p.includes("/threads/")) return { messages: [{ id: "old", payload: { parts: [{ filename: "Old drawing.pdf", mimeType: "application/pdf", body: { size: 1000, attachmentId: "a0" } }] } }, { id: "new", payload: { parts: [{ mimeType: "text/plain", body: { data: "aGk" } }, { filename: "ALS-104665 Quotation.pdf", mimeType: "application/pdf", body: { size: 40960, attachmentId: "a1" } }] } }] };
    if (p.includes("/attachments/")) return { data: Buffer.from("%PDF-quote").toString("base64url") };
    if (p === "/drive/v3/files" && (opts.method ?? "GET") === "GET") {
      const parent = (opts.query!.q as string).match(/'([^']+)' in parents/)![1];
      return { files: [...drive.values()].filter((f) => f.parents[0] === parent && !f.trashed && ((opts.query!.q as string).includes("application/pdf") ? f.mimeType === "application/pdf" : f.mimeType === F)) };
    }
    if (p === "/drive/v3/files" && opts.method === "POST") {
      const b = opts.body as { name: string; parents: string[]; mimeType: string };
      put(`made${drive.size}`, b.name, b.parents[0], b.mimeType);
      return [...drive.values()].at(-1);
    }
    if (p.endsWith("/copy")) {
      const b = opts.body as { name: string; parents: string[] };
      put(`copy${drive.size}`, b.name, b.parents[0], DOC);
      return [...drive.values()].at(-1);
    }
    const f = drive.get(decodeURIComponent(p.split("/").pop()!));
    if (!f) throw new Error(`not found ${p}`);
    return f;
  }),
  googleFetch: vi.fn(async (_e: string, p: string, opts: { method?: string } = {}) => {
    calls.push({ path: p, method: opts.method ?? "GET" });
    if (p.includes("/upload/")) {
      uploads++;
      if (opts.method === "PATCH") return new Response(JSON.stringify({ id: p.split("/").pop() }));
      put(`up${uploads}`, "uploaded", "x", "application/pdf");
      return new Response(JSON.stringify({ id: `up${uploads}`, webViewLink: `https://drive/up${uploads}` }));
    }
    return new Response("%PDF-1.4\n/Type /Page\n/Type /Page\n");
  }),
}));

d("the assistant's hands in Google", () => {
  let sql: ReturnType<typeof postgres>;
  let w: typeof import("./workspace");

  beforeAll(async () => {
    const admin = postgres(url!, { max: 1, onnotice: () => {} });
    await admin.unsafe("drop schema public cascade; create schema public;");
    const dir = path.join(__dirname, "../../../db/migrations");
    for (const f of readdirSync(dir).sort()) await admin.unsafe(readFileSync(path.join(dir, f), "utf8"));
    await admin.end();
    process.env.DATABASE_URL = url;
    sql = (await import("../db")).sql;
    await sql`update settings set value = jsonb_set(value, '{mode}', '"live"') where key = 'google'`;
    w = await import("./workspace");
    put("top", "Enquiries & Tenders", "DRIVE");
    put(LIVE, "01 - Live", "top");
    put("job", "#557 – Patsy – Oaken Grove", LIVE);
    put("q01", "01 - Quote & Contract", "job");
    put("doc", "#557 – Oaken Grove, Shire Lane, Tring – Quote", "q01", DOC);
    put("pdf", "#557 – Oaken Grove, Shire Lane, Tring – Quote.pdf", "q01", "application/pdf");
    put(TEMPLATE, "Short form quote template", "top", DOC);
    const [j] = await sql`insert into jobs (number, stage, site) values (557, 'Draft quote', 'Oaken Grove') returning id`;
    await sql`insert into documents (job_id, kind, revision, name, doc_id, url, pdf_file_id, pdf_url) values (${j.id}, 'quote', 6, 'q', 'doc', 'u', 'oldpdf', 'oldurl')`;
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("changes wording in a Doc and says what it couldn't find, but never touches a template", async () => {
    const r = await w.docEdit(ME, "doc", [{ find: "#557/6", replace: "#557" }, { find: " Stage 2:", replace: "\nStage 2:" }, { find: "not there", replace: "x" }]);
    expect(r.changes.map((c) => c.places_changed)).toEqual([2, 1, 0]);
    expect(r.not_found).toEqual(["not there"]);
    await expect(w.docEdit(ME, TEMPLATE, [{ find: "a", replace: "b" }])).rejects.toThrow("the app depends on");
    await expect(w.docEdit(ME, "pdf", [{ find: "a", replace: "b" }])).rejects.toThrow("isn't a Google Doc");
  });

  it("saves a Doc as a PDF over the one already there, keeping its link, and points the job's quote at it", async () => {
    const r = await w.docToPdf(ME, "doc");
    expect(r).toMatchObject({ pdf: "#557 – Oaken Grove, Shire Lane, Tring – Quote.pdf", link: "https://drive/pdf", pages: 2, job_quote_updated: true });
    expect(calls.some((c) => c.path === "/upload/drive/v3/files/pdf" && c.method === "PATCH")).toBe(true);
    expect((await sql`select pdf_file_id, pdf_url, pages from documents where doc_id = 'doc'`)[0]).toMatchObject({ pdf_file_id: "pdf", pdf_url: "https://drive/pdf", pages: 2 });
  });

  it("opens the newest matching email attachment and files it in the job's folder", async () => {
    const got = await w.threadAttachments(ME, "t1", { mailbox: "info@battelectrical.com", name: "als", download: true });
    expect(got.files[0]).toMatchObject({ name: "ALS-104665 Quotation.pdf", mimeType: "application/pdf" });
    expect(got.files[0].data.toString()).toBe("%PDF-quote");
    await expect(w.threadAttachments(ME, "t1", { mailbox: "someone@else.com" })).rejects.toThrow("isn't a connected mailbox");
    await expect(w.threadAttachments(ME, "t1", { name: "missing", download: true })).rejects.toThrow('no attachment with "missing"');
    expect(await w.attachmentToDrive(ME, "t1", "ALS", "q01", "info@battelectrical.com")).toMatchObject({ filed: true, name: "ALS-104665 Quotation.pdf", in: "Enquiries & Tenders › 01 - Live › #557 – Patsy – Oaken Grove › 01 - Quote & Contract" });
  });

  it("makes a folder once, copies a template into a job, and drafts an email with a Doc attached as a PDF and nobody in To", async () => {
    const made = await w.driveMakeFolder(ME, "09 - Surveys", { folderId: "job" });
    expect(made.made).toBe(true);
    expect((await w.driveMakeFolder(ME, "09 - Surveys", { folderId: "job" })).made).toBe(false);
    expect(await w.driveCopy(ME, TEMPLATE, "q01", "#557 – Letter")).toMatchObject({ copied: true, name: "#557 – Letter" });
    const e = await w.draftEmail(ME, { to: "", cc: "", subject: "Quotation #557", body: "Hi Patsy,\n\nAttached.\n\nKind Regards,", attachFileIds: ["doc"] });
    expect(e).toMatchObject({ drafted: true, attached: ["#557 – Oaken Grove, Shire Lane, Tring – Quote.pdf"] });
    expect(drafts[0]).toMatchObject({ to: "", allowNoTo: true, attachments: [{ mimeType: "application/pdf" }] });
    const log = await sql`select action from audit_log where action like '%(assistant)' order by at`;
    expect(log.map((r) => r.action)).toEqual(["Doc edited (assistant)", "PDF saved from Doc (assistant)", "Email attachment filed (assistant)", "Drive: folder made (assistant)", "Drive: copied (assistant)", "email drafted (assistant)"]);
  });
});
