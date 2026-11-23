import "server-only";
/** Gmail: drafts (never sending) and finding a job's threads. */
import { buildRaw, senderName, type DraftInput } from "../email";
import { GMAIL_NOT_CONNECTED, GoogleError, gmailConnected, gmailMailboxes, google, googleFetch } from "./client";

const GMAIL = "/gmail/v1/users/me";

/** Saves a draft in the person's own Gmail. Returns a link that opens it ready to check and send. */
export async function createDraft(email: string, d: Omit<DraftInput, "from">): Promise<{ draftId: string; messageId: string; url: string }> {
  if (!(await gmailConnected(email))) throw new GoogleError(GMAIL_NOT_CONNECTED, 401);
  const raw = buildRaw({ ...d, from: email });
  const r = await google<{ id: string; message: { id: string } }>(email, `${GMAIL}/drafts`, { method: "POST", body: { message: { raw } } });
  return { draftId: r.id, messageId: r.message.id, url: `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#drafts?compose=${r.message.id}` };
}

/** Downloads a Drive file's bytes (e.g. the quote PDF to attach). */
export async function driveFileBytes(email: string, fileId: string): Promise<Buffer> {
  const res = await googleFetch(email, `/drive/v3/files/${encodeURIComponent(fileId)}`, { query: { alt: "media", supportsAllDrives: true } });
  if (!res.ok) throw new GoogleError(res.status === 404 ? "Google couldn't find the PDF in Drive. Make the quote again." : `Google wouldn't send the PDF (${res.status}).`, res.status);
  return Buffer.from(await res.arrayBuffer());
}

export type ThreadRow = { mailbox: string; threadId: string; subject: string; from: string; date: string; snippet: string; count: number; url: string | null };

type Header = { name: string; value: string };
type GmailThread = { id: string; snippet?: string; messages?: { id: string; internalDate: string; snippet?: string; payload?: { headers?: Header[] } }[] };

/** A job's email threads, from every connected mailbox, newest first. `viewer` gets links to their own threads. */
export async function jobThreads(query: string, viewer: string): Promise<{ threads: ThreadRow[]; problems: string[] }> {
  const boxes = await gmailMailboxes();
  const problems: string[] = [];
  const all = await Promise.all(
    boxes.map(async (box) => {
      try {
        const list = await google<{ threads?: { id: string }[] }>(box, `${GMAIL}/threads`, { query: { q: query, maxResults: 20 } });
        const threads = await Promise.all(
          (list.threads ?? []).map((t) =>
            google<GmailThread>(box, `${GMAIL}/threads/${t.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`).then((full) => {
              // Subject from the first message; who and when from the latest.
              const msgs = full.messages ?? [];
              const head = (m: (typeof msgs)[number] | undefined, n: string) => m?.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
              const first = msgs[0];
              const last = msgs.at(-1);
              return {
                mailbox: box,
                threadId: full.id,
                subject: head(first, "subject") || "(no subject)",
                from: senderName(head(last, "from")),
                date: last ? new Date(Number(last.internalDate)).toISOString() : "",
                snippet: last?.snippet ?? full.snippet ?? "",
                count: msgs.length,
                url: box === viewer.toLowerCase() ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(box)}#all/${full.id}` : null,
              } satisfies ThreadRow;
              }),
          ),
        );
        return threads;
      } catch (e) {
        problems.push(`${box}: ${e instanceof Error ? e.message : String(e)}`);
        return [];
      }
    }),
  );
  return { threads: all.flat().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40), problems };
}
