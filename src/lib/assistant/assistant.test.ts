/**
 * The assistant's tools and conversation loop, against a throwaway database, with Google and the
 * Anthropic API faked. Runs only when TEST_DATABASE_URL is set. It wipes that database.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../google/drive", () => ({ syncJobFolder: vi.fn(async () => "") }));
vi.mock("../google/pricing-run", () => ({
  loadPriceList: vi.fn(async () => ({
    products: [
      { key: "Double socket | Click | White Plastic", label: "Double socket", section: "Power & Data", materials: 4.2, hours: 0.75 },
      { key: "Downlight | Fire rated | White", label: "Downlight", section: "Lighting", materials: 9, hours: 0.5 },
    ],
    fetchedAt: "",
  })),
  priceDirect: vi.fn(async () => ({ ok: false, message: "Not in this test." })),
  priceJob: vi.fn(async () => ({ ok: false, message: "A few things need fixing before this can be priced.", problems: ["Item 1: not on the price list"] })),
}));
vi.mock("../google/quote-run", () => ({ buildShortQuote: vi.fn(), buildLongQuote: vi.fn() }));
vi.mock("../google/gmail", () => ({ jobThreads: vi.fn(async () => ({ threads: [], problems: [] })), createDraft: vi.fn(), driveFileBytes: vi.fn(), threadText: vi.fn(), inboxThreads: vi.fn(async () => []) }));
vi.mock("../google/calendar", () => ({ syncVisit: vi.fn(async () => "Added to the calendar (test calendar).") }));
vi.mock("../google/drive-actions", () => ({ driveFind: vi.fn(async () => []), driveMove: vi.fn(), driveRename: vi.fn(), driveBin: vi.fn() }));
vi.mock("../google/job-files", () => ({
  listAllJobFiles: vi.fn(async () => ({ files: [{ id: "file-pdf-1", name: "Quote.pdf", folder: "01 - Quote", kind: "PDF", sizeKb: 200, modified: "2026-11-20", link: "https://drive/p", mimeType: "application/pdf" }], more: false })),
  readJobFile: vi.fn(async () => ({ summary: { name: "Quote.pdf", kind: "PDF" }, blocks: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: "QUJD" } }] })),
}));
vi.mock("../google/client", () => ({
  errorText: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  googleSettings: async () => ({ mode: "test" }),
}));

// A fake model: the first step looks a job up, the second answers in words.
const script: unknown[][] = [];
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
  }
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = class extends APIError {};
    static RateLimitError = class extends APIError {};
    calls: unknown[] = [];
    beta = {
      messages: {
        stream: (params: unknown) => {
          Anthropic.requests.push(JSON.parse(JSON.stringify(params)));
          const content = script.shift() ?? [{ type: "text", text: "Done." }];
          const toolUse = content.some((b) => (b as { type: string }).type === "tool_use");
          const message = { content, stop_reason: toolUse ? "tool_use" : "end_turn" };
          return {
            async *[Symbol.asyncIterator]() {
              for (const b of content as { type: string; text?: string }[])
                if (b.type === "text") yield { type: "content_block_delta", delta: { type: "text_delta", text: b.text } };
            },
            finalMessage: async () => message,
          };
        },
      },
    };
    static requests: unknown[] = [];
  }
  return { default: Anthropic };
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const me = { email: "callum@battelectrical.com", name: "Callum" };

d("the assistant", () => {
  let sql: ReturnType<typeof postgres>;
  let tools: typeof import("./tools");
  let run: typeof import("./run");

  beforeAll(async () => {
    const admin = postgres(url!, { max: 1, onnotice: () => {} });
    await admin.unsafe("drop schema public cascade; create schema public;");
    const dir = path.join(__dirname, "../../../db/migrations");
    for (const f of readdirSync(dir).sort()) await admin.unsafe(readFileSync(path.join(dir, f), "utf8"));
    await admin.end();
    process.env.DATABASE_URL = url;
    tools = await import("./tools");
    run = await import("./run");
    sql = (await import("../db")).sql;
    await sql`insert into jobs (number, stage, site) values (558, 'Quoted', 'Old job')`;
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("describes every tool with an object schema and a unique name", () => {
    const names = tools.toolDefinitions.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of tools.toolDefinitions) {
      expect(t.input_schema.type).toBe("object");
      expect(t.input_schema).not.toHaveProperty("$schema");
      expect(t.input_schema.properties).toBeDefined();
      expect(t.description!.length).toBeGreaterThan(20);
    }
  });

  it("creates, finds, updates, notes and numbers a job", async () => {
    const made = await tools.runTool("create_job", { client: "Meterz", site: "Brook House", postcode: "hp19 8ab", description: "Rewire" }, me);
    expect(made.ok).toBe(true);
    const { job_id } = JSON.parse(made.content);

    const found = JSON.parse((await tools.runTool("find_jobs", { query: "Brook" }, me)).content);
    expect(found.jobs[0]).toMatchObject({ job: "TBC", stage: "Enquiry", client: "Meterz", postcode: "HP19 8AB" });

    expect((await tools.runTool("update_job", { job: job_id, miles_round_trip: 24 }, me)).ok).toBe(true);
    expect((await tools.runTool("add_note", { job: job_id, note: "Client wants it before Christmas" }, me)).ok).toBe(true);
    expect((await tools.runTool("update_job", { job: job_id, client: "meterz", quote_ex_vat: 6700 }, me)).ok).toBe(true);
    expect((await tools.runTool("update_job", { job: job_id, client: "New Client Ltd" }, me)).ok).toBe(true);
    const [set] = await sql`select c.name, j.quote_value::float as v, (select count(*)::int from clients where lower(name) = 'meterz') as n from jobs j join clients c on c.id = j.client_id where j.id = ${job_id}`;
    expect(set).toMatchObject({ name: "New Client Ltd", v: 6700, n: 1 });
    expect((await tools.runTool("update_job", { job: job_id, client: "Meterz" }, me)).ok).toBe(true);

    const moved = JSON.parse((await tools.runTool("set_stage", { job: job_id, stage: "Draft quote" }, me)).content);
    expect(moved).toMatchObject({ moved: true, from: "Enquiry", to: "Draft quote", number: 559 });

    const job = JSON.parse((await tools.runTool("get_job", { job: "559" }, me)).content);
    expect(job).toMatchObject({ job: "#559", miles_round_trip: 24, site: "Brook House", app_link: "/jobs/559" });
    expect(job.notes).toMatch(/Callum: Client wants it before Christmas$/);
  });

  it("finds price list items by every word", async () => {
    const r = JSON.parse((await tools.runTool("search_price_list", { query: "double socket" }, me)).content);
    expect(r.products.map((p: { key: string }) => p.key)).toEqual(["Double socket | Click | White Plastic"]);
  });

  it("refuses bad input and unknown jobs without throwing", async () => {
    const bad = await tools.runTool("update_job", { job: "559", miles_round_trip: -3 }, me);
    expect(bad.ok).toBe(false);
    expect(bad.content).toMatch(/^INVALID_INPUT/);
    const missing = await tools.runTool("get_job", { job: "9999" }, me);
    expect(missing).toEqual({ ok: false, content: "There's no job 9999. Use find_jobs to look it up." });
    expect((await tools.runTool("price_job", { job: "559", items: [{ area: "Kitchen", key: "Nope", qty: 1 }], miles: 24, people: 2, vans: 1 }, me)).ok).toBe(false);
    expect((await tools.runTool("make_quote", { job: "559" }, me)).content).toMatch(/Price the job first/);
  });

  it("lists and opens a job's Drive files, and drops the file itself from later turns", async () => {
    expect(JSON.parse((await tools.runTool("job_files", { job: "558" }, me)).content).message).toMatch(/no Drive folder yet/);
    await sql`update jobs set drive_folder_id = 'folder559' where number = 559`;
    const list = JSON.parse((await tools.runTool("job_files", { job: "559" }, me)).content);
    expect(list).toMatchObject({ job: "#559", count: 1, files: [{ id: "file-pdf-1", folder: "01 - Quote", kind: "PDF" }] });
    expect(list.files[0]).not.toHaveProperty("mimeType");
    const opened = await tools.runTool("read_file", { job: "559", file_id: "file-pdf-1" }, me);
    expect(opened.ok).toBe(true);
    expect(opened.blocks!.map((b) => b.type)).toEqual(["text", "document"]);
    const kept = run.slim([{ role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: opened.blocks }] }]);
    const result = (kept[0].content as { content: { type: string; text?: string }[] }[])[0].content;
    expect(result.map((b) => b.type)).toEqual(["text", "text"]);
    expect(result[1].text).toMatch(/Open it again with read_file/);
    // The assistant's working-out after a changed message is dropped, including in a chat that was saved already slimmed.
    const chat = [
      { role: "assistant" as const, content: [{ type: "thinking" as const, thinking: "a", signature: "s1" }, { type: "tool_use" as const, id: "t", name: "read_file", input: {} }] },
      { role: "user" as const, content: [{ type: "tool_result" as const, tool_use_id: "t", content: opened.blocks }] },
      { role: "assistant" as const, content: [{ type: "thinking" as const, thinking: "b", signature: "s2" }, { type: "text" as const, text: "Here it is." }] },
    ];
    const once = run.slim(chat);
    expect((once[0].content as { type: string }[]).map((b) => b.type)).toEqual(["thinking", "tool_use"]);
    expect((once[2].content as { type: string }[]).map((b) => b.type)).toEqual(["text"]);
    const saved = [once[0], once[1], chat[2]];
    expect((run.slim(saved)[2].content as { type: string }[]).map((b) => b.type)).toEqual(["text"]);
  });

  it("drops a saved chat's old working-out when the instructions have changed since, and keeps the date out of the instructions", async () => {
    const id = await run.createChat(me.email, "Earlier");
    const old = [
      { role: "user", content: "Earlier" },
      { role: "assistant", content: [{ type: "thinking", thinking: "x", signature: "sig" }, { type: "text", text: "Hello." }] },
    ];
    await sql`update assistant_chats set messages = ${sql.json(old as never)}, fingerprint = 'an-older-version' where id = ${id}`;
    script.push([{ type: "text", text: "Still here." }]);
    for await (const ev of run.runTurn(id, me, "And now?")) void ev;
    const sdk = (await import("@anthropic-ai/sdk")).default as unknown as { requests: { system: { text: string }[]; messages: { role: string; content: { type: string; text?: string }[] }[] }[] };
    const sent = sdk.requests.at(-1)!;
    expect(sent.messages[1].content.map((b) => b.type)).toEqual(["text"]);
    expect(sent.system).toHaveLength(2);
    expect(sent.system.map((b) => b.text).join(" ")).not.toMatch(/Today is \d/);
    expect(sent.messages[2].content[1].text).toMatch(/^\[From the app, not the user\] Today is [\d\/-]{10}\. Google mode: test\./);
    const again = await run.getChat(id, me.email);
    expect(again!.fingerprint).not.toBe("an-older-version");
    expect(run.toDisplay(again!.messages).map((x) => x.role === "tool" ? x.label : x.text)).toEqual(["Earlier", "Hello.", "And now?", "Still here."]);
  });

  it("remembers lasting rules for everyone and gives them, with the handbook, to a new chat", async () => {
    const saved = JSON.parse((await tools.runTool("remember", { note: "Meterz invoices go to accounts, not Gwen." }, me)).content);
    expect(saved.saved).toBe(true);
    const gone = JSON.parse((await tools.runTool("remember", { note: "An old rule that no longer holds." }, me)).content);
    expect((await tools.runTool("forget", { id: gone.id }, me)).ok).toBe(true);
    expect(JSON.parse((await tools.runTool("memory", {}, me)).content).notes.map((n: { note: string }) => n.note)).toEqual(["Meterz invoices go to accounts, not Gwen."]);

    const id = await run.createChat(me.email, "Hi");
    script.push([{ type: "text", text: "Hello." }]);
    for await (const ev of run.runTurn(id, me, "Hi")) void ev;
    script.push([{ type: "text", text: "Yes." }]);
    for await (const ev of run.runTurn(id, me, "Again")) void ev;
    const sdk = (await import("@anthropic-ai/sdk")).default as unknown as { requests: { system: { text: string }[]; messages: { content: { text?: string }[] }[] }[] };
    const sent = sdk.requests.at(-1)!;
    expect(sent.system[1].text).toMatch(/^# Batt handbook/);
    expect(sent.messages[0].content[1].text).toContain("- Meterz invoices go to accounts, not Gwen. (Callum,");
    expect(sent.messages[0].content[1].text).not.toContain("An old rule");
    expect(sent.messages[2].content[1].text).not.toContain("Saved to memory");
    expect(run.toDisplay((await run.getChat(id, me.email))!.messages).map((x) => (x as { text: string }).text)).toEqual(["Hi", "Hello.", "Again", "Yes."]);
  });

  it("starts a new chat knowing the recent ones, and can find and read an earlier chat", async () => {
    const first = await run.createChat(me.email, "Price the Oaken Grove job");
    script.push([{ type: "text", text: "Priced Oaken Grove at £1,124.07 ex VAT." }]);
    for await (const ev of run.runTurn(first, me, "Price the Oaken Grove job")) void ev;

    const next = await run.createChat(me.email, "What did we price yesterday?");
    script.push([{ type: "text", text: "Oaken Grove." }]);
    for await (const ev of run.runTurn(next, me, "What did we price yesterday?")) void ev;
    const sdk = (await import("@anthropic-ai/sdk")).default as unknown as { requests: { messages: { content: { text?: string }[] }[] }[] };
    const told = sdk.requests.at(-1)!.messages[0].content[1].text!;
    expect(told).toContain("recent chats with you");
    expect(told).toContain(`"Price the Oaken Grove job", which ended: Priced Oaken Grove at £1,124.07 ex VAT. [${first}]`);

    const found = JSON.parse((await tools.runTool("past_chats", { about: "oaken grove" }, me)).content);
    expect(found.chats.map((c: { id: string }) => c.id)).toContain(first);
    expect(JSON.parse((await tools.runTool("past_chats", { about: "no such thing 100%" }, me)).content).chats).toEqual([]);
    const read = JSON.parse((await tools.runTool("read_chat", { id: first }, me)).content);
    expect(read.conversation).toBe("User: Price the Oaken Grove job\nYou: Priced Oaken Grove at £1,124.07 ex VAT.");
    expect((await tools.runTool("read_chat", { id: first }, { email: "someone@else.com", name: "X" })).ok).toBe(false);
  });

  it("books a visit by name, and stops for a clash until told to go ahead", async () => {
    const people = await sql`select short_name from people where active order by position`;
    const who = people[0].short_name as string;
    const first = JSON.parse((await tools.runTool("book_visit", { job: "559", date: "2026-12-04", start: "09:00", people: [who.toLowerCase()], work: "Fit meter enclosures" }, me)).content);
    expect(first).toMatchObject({ booked: true, job: "#559", date: "2026-12-04", people: [who], calendar: "Added to the calendar (test calendar)." });
    const clash = JSON.parse((await tools.runTool("book_visit", { job: "558", date: "2026-12-04", people: [who], work: "Survey" }, me)).content);
    expect(clash).toMatchObject({ booked: false, clashes: [{ who, work: "Fit meter enclosures", job: "#559", start: "09:00" }] });
    expect(JSON.parse((await tools.runTool("book_visit", { job: "558", date: "2026-12-04", people: [who], work: "Survey", even_if_clash: true }, me)).content).booked).toBe(true);
    expect((await sql`select count(*)::int as n from visits where date = '2026-12-04'`)[0].n).toBe(2);
    expect(JSON.parse((await tools.runTool("book_visit", { job: "558", date: "2026-12-05", people: ["Nobody"], work: "Survey" }, me)).content).message).toMatch(/nobody called "Nobody"/);
  });

  it("runs a turn: calls a tool, answers, and saves the conversation", async () => {
    script.push([{ type: "text", text: "Looking it up. " }, { type: "tool_use", id: "tu_1", name: "get_job", input: { job: "559" } }]);
    script.push([{ type: "text", text: "Job 559 is Brook House for Meterz." }]);
    const chatId = await run.createChat(me.email, "What's 559?");
    const events = [];
    for await (const ev of run.runTurn(chatId, me, "What's 559?")) events.push(ev);
    expect(events).toEqual([
      { t: "text", d: "Looking it up. " },
      { t: "tool", id: "tu_1", label: "Opening job 559" },
      { t: "tool_done", id: "tu_1", ok: true },
      { t: "text", d: "Job 559 is Brook House for Meterz." },
      { t: "done" },
    ]);
    const chat = await run.getChat(chatId, me.email);
    expect(chat!.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(run.toDisplay(chat!.messages)).toEqual([
      { role: "user", text: "What's 559?" },
      { role: "assistant", text: "Looking it up. " },
      { role: "tool", label: "Opening job 559", ok: true },
      { role: "assistant", text: "Job 559 is Brook House for Meterz." },
    ]);
    // Another person can't open it.
    expect(await run.getChat(chatId, "cameron@battelectrical.com")).toBeNull();
  });

  it("mends a conversation that was cut off mid tool call", async () => {
    const chatId = await run.createChat(me.email, "x");
    await sql`update assistant_chats set messages = ${sql.json([
      { role: "user", content: "Price 559" },
      { role: "assistant", content: [{ type: "tool_use", id: "tu_9", name: "get_job", input: { job: "559" } }] },
    ] as never)} where id = ${chatId}`;
    const Anthropic = (await import("@anthropic-ai/sdk")).default as unknown as { requests: { messages: { role: string; content: unknown }[] }[] };
    for await (const ev of run.runTurn(chatId, me, "Carry on")) void ev;
    const sent = Anthropic.requests.at(-1)!.messages;
    expect(sent.map((m) => m.role)).toEqual(["user", "assistant", "user", "user"]);
    expect(JSON.stringify(sent[2].content)).toContain("Interrupted before it ran.");
  });
});
