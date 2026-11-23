import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "../db";
import { todayUK } from "../jobs-rules";
import { googleSettings } from "../google/client";
import { runTool, toolDefinitions, toolLabel, type Me } from "./tools";

type Msg = Anthropic.Beta.BetaMessageParam;

export const MODEL = "claude-opus-5-5";
const MAX_STEPS = 30;

export const assistantConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

const SYSTEM = `You are the job assistant inside Batt Job Hub, the job management app for Batt Electrical, an electrical contractor in Aylesbury, Buckinghamshire. You work for Batt's team (Cameron, the Managing Director, and Callum, the Project Manager). They are electricians, not developers.

What you do: look up jobs, clients and the diary; create and update jobs; price jobs in Batt's pricing spreadsheet; make quote documents from Batt's templates; move jobs between stages when asked. Every job is known by a plain number, like 559. Use the tools; never claim you did something a tool didn't confirm.

How to price a job:
1. Find the job (find_jobs), or create it if it's new and the user has given the client and site.
2. Work out the items, quantity and room for each from what the user said. Look each one up with search_price_list and use the exact key. If an item could match several products (finish, colour, type), pick the plain white plastic option only if the user's words fit it; otherwise ask.
3. You need round-trip miles, people on site and vans. Use miles_round_trip from the job if it's set. Otherwise ask. Never estimate miles, prices, rates, quantities or addresses.
4. If anything was unclear or you assumed it, list what you're about to price in a short table and ask "Shall I price that?" before calling price_job. If the user gave a clear, complete list, go ahead.
5. After pricing, give the sell price ex VAT and inc VAT, the margin against the target, site days, and the sheet link. Say plainly if the margin is below target.
6. Then make the quote if asked (or ask "Want the quote made?"). Give the PDF link when it's done.

Rules:
- Never send emails or messages. There's no tool for it. If asked, say it's coming and they can send it from Gmail for now.
- Money and prices only ever come from the pricing spreadsheet and Settings. Don't do your own maths on a price unless asked, and say it's your working.
- Don't change a job's stage unless asked.
- If a tool fails, say what went wrong in plain words and what the user can do about it. Don't retry the same thing more than once.
- Write plain British English: short sentences, no jargon, no em dashes. Use £ and UK dates (23/11/2026). Keep replies short; use a small table when listing items or money. Link to documents and sheets with their full URLs.`;

function systemBlocks(mode: string): Anthropic.Beta.BetaTextBlockParam[] {
  return [
    { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: `Today is ${todayUK()}. Google mode: ${mode}. ${mode === "test" ? "Documents and folders go in the clearly named test folders; nothing in the real Drive is touched." : "Live: documents go in the real job folders."}`,
    },
  ];
}

export type AssistantEvent =
  | { t: "text"; d: string }
  | { t: "tool"; id: string; label: string }
  | { t: "tool_done"; id: string; ok: boolean }
  | { t: "error"; message: string }
  | { t: "done" };

export type Chat = { id: string; email: string; title: string; job_id: string | null; messages: Msg[]; updated_at: string };

export async function getChat(id: string, email: string): Promise<Chat | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [c] = await sql<Chat[]>`select id, email, title, job_id, messages, updated_at::text from assistant_chats where id = ${id} and email = ${email}`;
  return c ? { ...c } : null;
}

export async function listChats(email: string) {
  return (await sql<{ id: string; title: string; updated_at: string }[]>`
    select id, title, updated_at::text from assistant_chats where email = ${email} order by updated_at desc limit 30`).map((r) => ({ ...r }));
}

async function saveChat(chat: { id: string | null; email: string; title: string; messages: Msg[] }) {
  if (chat.id) {
    await sql`update assistant_chats set messages = ${sql.json(chat.messages as never)}, updated_at = now() where id = ${chat.id} and email = ${chat.email}`;
    return chat.id;
  }
  const [row] = await sql<{ id: string }[]>`
    insert into assistant_chats (email, title, messages) values (${chat.email}, ${chat.title}, ${sql.json(chat.messages as never)}) returning id`;
  return row.id;
}

export async function createChat(email: string, firstMessage: string) {
  const title = firstMessage.replace(/\s+/g, " ").trim().slice(0, 80);
  return saveChat({ id: null, email, title, messages: [] });
}

/** If a turn was cut off between a tool call and its result, answer the call so the conversation is valid again. */
function repair(messages: Msg[]): Msg[] {
  const last = messages.at(-1);
  if (last?.role !== "assistant" || !Array.isArray(last.content)) return messages;
  const calls = last.content.filter((b) => b.type === "tool_use") as Anthropic.Beta.BetaToolUseBlockParam[];
  if (calls.length === 0) return messages;
  return [
    ...messages,
    { role: "user", content: calls.map((c) => ({ type: "tool_result" as const, tool_use_id: c.id, is_error: true, content: "Interrupted before it ran." })) },
  ];
}

/** One turn of the conversation: the user's message, then as many model steps and tool calls as it takes. */
export async function* runTurn(chatId: string, me: Me, userText: string): AsyncGenerator<AssistantEvent> {
  const chat = await getChat(chatId, me.email);
  if (!chat) {
    yield { t: "error", message: "That conversation wasn't found." };
    return;
  }
  const client = new Anthropic();
  const mode = (await googleSettings()).mode;
  const messages: Msg[] = [...repair(chat.messages), { role: "user", content: userText }];
  await saveChat({ ...chat, messages });

  let retries = 0;
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "high" },
        system: systemBlocks(mode),
        tools: toolDefinitions,
        messages,
        cache_control: { type: "ephemeral" },
      });

      let message: Anthropic.Beta.BetaMessage;
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield { t: "text", d: ev.delta.text };
        }
        message = await stream.finalMessage();
        retries = 0;
      } catch (err) {
        // A tool input that couldn't be read, or a dropped connection: try the step again, twice at most.
        if (err instanceof Anthropic.APIError || retries++ >= 2) throw err;
        continue;
      }

      messages.push({ role: "assistant", content: message.content });

      if (message.stop_reason === "pause_turn") continue;
      if (message.stop_reason === "refusal") {
        yield { t: "error", message: "The assistant declined that request. Try wording it differently." };
        break;
      }
      const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (calls.length === 0) break;
      if (message.stop_reason === "max_tokens") {
        // A cut-off tool call can look complete, so don't run it.
        messages.push({ role: "user", content: calls.map((c) => ({ type: "tool_result" as const, tool_use_id: c.id, is_error: true, content: "Your reply was cut off before this call finished. Make it again, shorter." })) });
        continue;
      }

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const c of calls) {
        yield { t: "tool", id: c.id, label: toolLabel(c.name, c.input) };
        const r = await runTool(c.name, c.input, me);
        yield { t: "tool_done", id: c.id, ok: r.ok };
        results.push({ type: "tool_result", tool_use_id: c.id, content: r.content, ...(r.ok ? {} : { is_error: true }) });
      }
      messages.push({ role: "user", content: results });
      await saveChat({ ...chat, messages });
      if (step === MAX_STEPS - 1) yield { t: "error", message: "That took too many steps, so I stopped. Tell me what's left and I'll carry on." };
    }
  } catch (err) {
    yield { t: "error", message: explain(err) };
  } finally {
    await saveChat({ ...chat, messages });
  }
  yield { t: "done" };
}

function explain(err: unknown) {
  if (err instanceof Anthropic.AuthenticationError) return "The assistant's API key isn't working. Check ANTHROPIC_API_KEY in Replit Secrets.";
  if (err instanceof Anthropic.RateLimitError) return "The assistant is busy (rate limit). Wait a minute and try again.";
  if (err instanceof Anthropic.APIError) return `The assistant service had a problem (${err.status ?? "no status"}). Try again in a moment.`;
  return err instanceof Error ? err.message : String(err);
}

/** What the screen shows for a saved conversation: the words, and a line for each thing the assistant did. */
export type DisplayItem = { role: "user"; text: string } | { role: "assistant"; text: string } | { role: "tool"; label: string; ok: boolean };

export function toDisplay(messages: Msg[]): DisplayItem[] {
  const out: DisplayItem[] = [];
  const failed = new Set<string>();
  for (const m of messages) {
    if (m.role === "user" && Array.isArray(m.content)) {
      for (const b of m.content) if (b.type === "tool_result" && b.is_error) failed.add(b.tool_use_id);
    }
  }
  for (const m of messages) {
    if (m.role === "user") {
      if (typeof m.content === "string") out.push({ role: "user", text: m.content });
      continue;
    }
    if (typeof m.content === "string") {
      out.push({ role: "assistant", text: m.content });
      continue;
    }
    for (const b of m.content ?? []) {
      if (b.type === "text" && b.text.trim()) out.push({ role: "assistant", text: b.text });
      if (b.type === "tool_use") out.push({ role: "tool", label: toolLabel(b.name, b.input), ok: !failed.has(b.id) });
    }
  }
  return out;
}
