import { currentPerson } from "@/lib/auth";
import { assistantConfigured, createChat, getChat, runTurn } from "@/lib/assistant/run";

/**
 * One message to the assistant. Replies stream back as lines of JSON: the chat id first, then words as they're
 * written and a line for each thing the assistant does. The turn finishes and is saved even if the page is closed.
 */
export async function POST(request: Request) {
  const me = await currentPerson();
  if (!me) return Response.json({ error: "Please sign in again." }, { status: 401 });
  if (!assistantConfigured()) return Response.json({ error: "The assistant isn't switched on yet: ANTHROPIC_API_KEY is missing from Replit Secrets." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { chatId?: unknown; message?: unknown };
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 20000) : "";
  if (!message) return Response.json({ error: "Type a message first." }, { status: 400 });

  let chatId = typeof body.chatId === "string" ? body.chatId : "";
  if (chatId && !(await getChat(chatId, me.email))) return Response.json({ error: "That conversation wasn't found." }, { status: 404 });
  if (!chatId) chatId = await createChat(me.email, message);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (obj: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          open = false; // the page was closed; keep going so the turn finishes and is saved
        }
      };
      send({ t: "chat", id: chatId });
      for await (const ev of runTurn(chatId, me, message)) send(ev);
      if (open) controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
