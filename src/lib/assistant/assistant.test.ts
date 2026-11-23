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
  priceJob: vi.fn(async () => ({ ok: false, message: "A few things need fixing before this can be priced.", problems: ["Item 1: not on the price list"] })),
}));
vi.mock("../google/quote-run", () => ({ buildShortQuote: vi.fn(), buildLongQuote: vi.fn() }));
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
