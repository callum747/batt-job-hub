import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { currentPerson } from "@/lib/auth";
import { assistantConfigured, getChat, listChats, toDisplay } from "@/lib/assistant/run";
import { PageHeader } from "@/components/page";
import { ukDate } from "@/lib/jobs-rules";
import { Chat } from "./chat";

export const metadata = { title: "Claude API" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string; job?: string; new?: string }> }) {
  const { c, job, new: fresh } = await searchParams;
  const me = await currentPerson();
  if (!me) return null;
  const [chats, chat] = await Promise.all([listChats(me.email), c ? getChat(c, me.email) : null]);
  // Coming back to Ask (or refreshing) carries on with the last conversation. "New chat" starts a clean one.
  const mine = chats.find((x) => x.mine);
  if (!c && !job && !fresh && mine) redirect(`/assistant?c=${mine.id}`);
  const ready = assistantConfigured();

  return (
    <>
      <PageHeader
        title="Claude API"
        intro="Tell it what you need: price a job, make the quote, find a job, check the diary."
        action={
          <Link href="/assistant?new=1" className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-bg px-5 font-medium hover:bg-surface">
            <MessageSquarePlus className="h-5 w-5" aria-hidden="true" /> New chat
          </Link>
        }
      />
      {!ready ? (
        <div className="rounded-2xl border border-warn/30 bg-warn/10 p-5">
          <p className="font-semibold">The assistant isn&apos;t switched on yet.</p>
          <p className="mt-1">It needs an Anthropic API key. In Replit, open <b>Secrets</b>, add <b>ANTHROPIC_API_KEY</b> with the key, then Republish.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
          <Chat
            key={chat?.id ?? "new"}
            chatId={chat?.id ?? null}
            initial={chat ? toDisplay(chat.messages) : []}
            prefill={job ? `About job ${job.replace(/^#/, "#")}: ` : ""}
          />
          {chats.length > 0 && (
            <aside>
              <h2 className="mb-2 text-[15px] font-semibold text-muted">Earlier chats</h2>
              <p className="mb-2 text-[13px] text-muted">Everyone&apos;s chats are kept here and anyone can pick one up.</p>
              <ul className="space-y-1">
                {chats.map((x) => (
                  <li key={x.id}>
                    <Link
                      href={`/assistant?c=${x.id}`}
                      className={`block rounded-xl px-3 py-2 text-[15px] hover:bg-surface ${x.id === chat?.id ? "bg-blue-soft" : ""}`}
                    >
                      <span className="line-clamp-2">{x.title || "Untitled"}</span>
                      <span className="text-[13px] text-muted">{ukDate(x.updated_at.slice(0, 10))}{x.mine ? "" : ` · ${x.by}`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      )}
    </>
  );
}
