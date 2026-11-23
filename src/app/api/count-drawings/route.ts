import { currentPerson } from "@/lib/auth";
import { countDrawings } from "@/lib/google/drawings-run";

/**
 * Counts the chosen drawings. Reading drawings can take a few minutes, so the reply is a stream:
 * a "still working" line every few seconds, then the result. The count is saved on the job either way.
 */
export async function POST(request: Request) {
  const me = await currentPerson();
  if (!me) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { jobId?: unknown; fileIds?: unknown };
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const fileIds = Array.isArray(body.fileIds) ? body.fileIds.map(String).slice(0, 20) : [];
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return Response.json({ error: "That job wasn't found." }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (obj: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          open = false;
        }
      };
      const ping = setInterval(() => send({ t: "working" }), 8000);
      try {
        const r = await countDrawings(jobId, fileIds, me);
        send(r.ok ? { t: "done", ok: true } : { t: "done", ok: false, message: r.message });
      } finally {
        clearInterval(ping);
        if (open) controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
