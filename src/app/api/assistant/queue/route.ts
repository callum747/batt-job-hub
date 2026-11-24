import { currentPerson } from "@/lib/auth";
import { assistantConfigured, queueMessage } from "@/lib/assistant/run";

/** A message sent while the assistant is still working on the last one. It reads it between steps. */
export async function POST(request: Request) {
  const me = await currentPerson();
  if (!me) return Response.json({ error: "Please sign in again." }, { status: 401 });
  if (!assistantConfigured()) return Response.json({ error: "The assistant isn't switched on." }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { chatId?: unknown; message?: unknown };
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 20000) : "";
  const chatId = typeof body.chatId === "string" ? body.chatId : "";
  if (!message || !chatId) return Response.json({ error: "Type a message first." }, { status: 400 });
  const id = await queueMessage(chatId, me.email, message);
  return id ? Response.json({ id }) : Response.json({ error: "That conversation wasn't found." }, { status: 404 });
}
