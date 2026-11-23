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

async function threadRow(box: string, id: string, viewer: string): Promise<ThreadRow> {
  const full = await google<GmailThread>(box, `${GMAIL}/threads/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`);
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
  };
}

/**
 * A job's email threads, from every connected mailbox, newest first: those the search finds, plus any linked
 * to the job from the inbox. `viewer` gets links to their own threads.
 */
export async function jobThreads(query: string | null, viewer: string, linked: { mailbox: string; threadId: string }[] = []): Promise<{ threads: ThreadRow[]; problems: string[] }> {
  const boxes = await gmailMailboxes();
  const problems: string[] = [];
  const all = await Promise.all(
    boxes.map(async (box) => {
      try {
        const found = query ? ((await google<{ threads?: { id: string }[] }>(box, `${GMAIL}/threads`, { query: { q: query, maxResults: 20 } })).threads ?? []).map((t) => t.id) : [];
        const ids = [...new Set([...found, ...linked.filter((l) => l.mailbox === box).map((l) => l.threadId)])];
        return await Promise.all(ids.map((id) => threadRow(box, id, viewer).catch(() => null)));
      } catch (e) {
        problems.push(`${box}: ${e instanceof Error ? e.message : String(e)}`);
        return [];
      }
    }),
  );
  return { threads: all.flat().filter((t): t is ThreadRow => t !== null).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40), problems };
}

export type InboxThread = { threadId: string; subject: string; from: string; fromEmail: string; date: string; snippet: string; count: number; url: string };

const addressOf = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();

/**
 * Recent emails in this person's own inbox from outside Batt: the ones that might be enquiries or job emails.
 * Promotions, social, updates and forums are left out.
 */
export async function inboxThreads(email: string, ownDomain: string): Promise<InboxThread[]> {
  if (!(await gmailConnected(email))) throw new GoogleError(GMAIL_NOT_CONNECTED, 401);
  const q = `in:inbox newer_than:30d -category:promotions -category:social -category:updates -category:forums -from:${ownDomain}`;
  const list = await google<{ threads?: { id: string }[] }>(email, `${GMAIL}/threads`, { query: { q, maxResults: 40 } });
  const rows = await Promise.all(
    (list.threads ?? []).map((t) =>
      google<GmailThread>(email, `${GMAIL}/threads/${t.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`).then((full) => {
        const msgs = full.messages ?? [];
        const head = (m: (typeof msgs)[number] | undefined, n: string) => m?.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
        // Who started it from outside: the first message not from Batt.
        const outside = msgs.find((m) => !addressOf(head(m, "from")).endsWith("@" + ownDomain)) ?? msgs[0];
        const last = msgs.at(-1);
        const from = head(outside, "from");
        return {
          threadId: full.id,
          subject: head(msgs[0], "subject") || "(no subject)",
          from: senderName(from),
          fromEmail: addressOf(from),
          date: last ? new Date(Number(last.internalDate)).toISOString() : "",
          snippet: last?.snippet ?? full.snippet ?? "",
          count: msgs.length,
          url: `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#inbox/${full.id}`,
        } satisfies InboxThread;
      }),
    ),
  );
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

type Part = { mimeType?: string; filename?: string; body?: { data?: string; size?: number }; parts?: Part[]; headers?: Header[] };

const b64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

/** The readable text of a message: its plain-text part, or its HTML part with the tags taken out. */
export function messageText(p: Part): { text: string; attachments: string[] } {
  const attachments: string[] = [];
  let plain = "";
  let html = "";
  const walk = (x: Part) => {
    if (x.filename) attachments.push(x.filename);
    else if (x.mimeType === "text/plain" && x.body?.data && !plain) plain = b64(x.body.data);
    else if (x.mimeType === "text/html" && x.body?.data && !html) html = b64(x.body.data);
    x.parts?.forEach(walk);
  };
  walk(p);
  const fromHtml = () =>
    html
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"');
  const text = (plain || fromHtml()).replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return { text, attachments: attachments.filter(Boolean) };
}

export type ThreadText = { subject: string; messages: { from: string; fromEmail: string; date: string; text: string; attachments: string[] }[] };

/** A whole thread as readable text (the last five messages, each cut at 12,000 characters). */
export async function threadText(email: string, threadId: string): Promise<ThreadText> {
  const t = await google<{ messages?: { internalDate: string; payload?: Part }[] }>(email, `${GMAIL}/threads/${encodeURIComponent(threadId)}`, { query: { format: "full" } });
  const msgs = (t.messages ?? []).slice(-5);
  const head = (p: Part | undefined, n: string) => p?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
  return {
    subject: head(t.messages?.[0]?.payload, "subject"),
    messages: msgs.map((m) => {
      const { text, attachments } = messageText(m.payload ?? {});
      const from = head(m.payload, "from");
      return { from: senderName(from), fromEmail: addressOf(from), date: new Date(Number(m.internalDate)).toISOString(), text: text.slice(0, 12000), attachments };
    }),
  };
}
