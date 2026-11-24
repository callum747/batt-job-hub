"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Check, Loader2, Mic, Square, X } from "lucide-react";
import { joinSpoken, useDictation } from "./dictate";

type Item = { role: "user"; text: string; queued?: string } | { role: "assistant"; text: string } | { role: "tool"; label: string; ok: boolean | null; id?: string };

const SUGGESTIONS = [
  "Price job 559: 8 double sockets and 12 downlights in the kitchen, 2 people, 1 van",
  "What's booked in the diary this week?",
  "Which quotes are still waiting for an answer?",
  "Make the quote for 559",
];

function Markdown({ text }: { text: string }) {
  return (
    <div className="chat-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ href, children }) => <a href={href} target={href?.startsWith("/") ? undefined : "_blank"} rel="noreferrer">{children}</a> }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function Chat({ chatId: startId, initial, prefill }: { chatId: string | null; initial: Item[]; prefill: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initial);
  const [input, setInput] = useState(prefill);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const chatId = useRef(startId);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // Speaking instead of typing: each finished phrase is added to the box.
  const mic = useDictation((spoken) => setInput((typed) => joinSpoken(typed, spoken)));

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [items]);

  // Messages sent while Claude is working: held here until he's read them. Any he never got to are sent when he finishes.
  const unread = useRef(new Map<string, string>());

  /** Sends a message into the task that's already running. He reads it between steps. */
  async function sendMidTask(message: string) {
    if (!chatId.current) return false;
    const key = `local-${Date.now()}`;
    setItems((xs) => [...xs, { role: "user", text: message, queued: key }]);
    try {
      const res = await fetch("/api/assistant/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: chatId.current, message }) });
      const j = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !j?.id) throw new Error(j?.error ?? "That didn't go through.");
      unread.current.set(j.id, message);
      setItems((xs) => xs.map((x) => (x.role === "user" && x.queued === key ? { ...x, queued: j.id } : x)));
      return true;
    } catch (e) {
      setItems((xs) => xs.filter((x) => !(x.role === "user" && x.queued === key)));
      setProblem(e instanceof Error ? e.message : String(e));
      setInput(message);
      return false;
    }
  }

  async function send(text: string, opts: { shown?: boolean } = {}) {
    const message = text.trim();
    if (!message) return;
    if (busy) {
      setInput("");
      await sendMidTask(message);
      return;
    }
    setBusy(true);
    setProblem("");
    setInput("");
    if (!opts.shown) setItems((xs) => [...xs, { role: "user", text: message }]);
    let leftOver = "";
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: chatId.current, message }) });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `Something went wrong (${res.status}).`);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      let failed = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { t: string; d?: string; id?: string; label?: string; ok?: boolean; message?: string };
          if (ev.t === "chat" && ev.id && !chatId.current) {
            chatId.current = ev.id;
            window.history.replaceState(null, "", `/assistant?c=${ev.id}`);
          } else if (ev.t === "took") {
            // He's read these: they're part of the conversation now.
            const ids = (ev as unknown as { ids: string[] }).ids ?? [];
            for (const id of ids) unread.current.delete(id);
            setItems((xs) => xs.map((x) => (x.role === "user" && x.queued && ids.includes(x.queued) ? { role: "user" as const, text: x.text } : x)));
          } else if (ev.t === "text") {
            setItems((xs) => {
              const last = xs.at(-1);
              if (last?.role === "assistant") return [...xs.slice(0, -1), { ...last, text: last.text + ev.d }];
              return [...xs, { role: "assistant", text: ev.d ?? "" }];
            });
          } else if (ev.t === "tool") {
            setItems((xs) => [...xs, { role: "tool", id: ev.id, label: ev.label ?? "", ok: null }]);
          } else if (ev.t === "tool_done") {
            setItems((xs) => xs.map((x) => (x.role === "tool" && x.id === ev.id ? { ...x, ok: Boolean(ev.ok) } : x)));
          } else if (ev.t === "error") {
            failed = true;
            setProblem(ev.message ?? "Something went wrong.");
          }
        }
      }
      // Anything sent too late for him to read mid-task goes as the next message.
      leftOver = [...unread.current.values()].join("\n\n");
      unread.current.clear();
      // Reload the list of chats. Not after a problem: the reload would clear the message explaining it.
      if (!failed && !leftOver) router.refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      box.current?.focus();
    }
    if (leftOver) {
      setItems((xs) => xs.map((x) => (x.role === "user" && x.queued ? { role: "user" as const, text: x.text } : x)));
      await send(leftOver, { shown: true });
    }
  }

  const waiting = busy && items.at(-1)?.role === "user";
  const working = busy && !waiting;

  return (
    <section className="flex min-h-[60dvh] flex-col rounded-2xl border border-line bg-bg shadow-card">
      <div className="flex-1 space-y-4 p-4 md:p-6" aria-live="polite">
        {items.length === 0 && (
          <div className="space-y-2">
            <p className="text-muted">Try one of these, or type your own:</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => setInput(s)} className="block w-full rounded-xl bg-surface px-4 py-3 text-left text-[15px] hover:bg-surface-2">
                {s}
              </button>
            ))}
          </div>
        )}
        {items.map((it, i) =>
          it.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-blue-soft px-4 py-3">
              {it.text}
              {it.queued && <span className="mt-1 block text-[13px] text-muted">Sent. He&apos;ll read it at his next step.</span>}
            </div>
          ) : it.role === "assistant" ? (
            <div key={i} className="max-w-full"><Markdown text={it.text} /></div>
          ) : (
            <p key={i} className="flex items-center gap-2 text-[14px] text-muted">
              {it.ok === null ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : it.ok ? <Check className="h-4 w-4 text-good" aria-hidden="true" /> : <X className="h-4 w-4 text-bad" aria-hidden="true" />}
              {it.label}
              {it.ok === false && <span className="sr-only">(didn&apos;t work)</span>}
            </p>
          ),
        )}
        {waiting && (
          <p className="flex items-center gap-2 text-[14px] text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Thinking
          </p>
        )}
        {working && (
          <p className="flex items-center gap-2 text-[14px] text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Working. You can send another message; he&apos;ll read it at his next step.
          </p>
        )}
        {problem && <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-[15px]">{problem}</p>}
        <div ref={end} />
      </div>
      <form
        className="sticky bottom-16 flex items-end gap-2 border-t border-line bg-bg p-3 md:bottom-0 md:rounded-b-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          mic.stop();
          send(input);
        }}
      >
        {(mic.listening || mic.problem) && (
          <p role="status" className={`absolute inset-x-3 -top-10 truncate rounded-lg px-3 py-2 text-[14px] shadow-card ${mic.problem ? "border border-warn/30 bg-warn/10" : "bg-blue-soft"}`}>
            {mic.problem || (mic.hearing ? mic.hearing : "Listening… speak, then press the square to stop or the arrow to send.")}
          </p>
        )}
        <label className="sr-only" htmlFor="ask">Message</label>
        <textarea
          id="ask"
          ref={box}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={Math.min(6, Math.max(1, input.split("\n").length))}
          placeholder={mic.supported ? "Ask Claude, or press the microphone and say it" : "Ask Claude, or tell it what to do"}
          className="min-h-12 flex-1 resize-none rounded-xl border border-line bg-bg px-4 py-3 text-[16px] outline-none placeholder:text-muted focus:border-blue"
        />
        {mic.supported && (
          <button
            type="button"
            onClick={() => (mic.listening ? mic.stop() : mic.start())}
            aria-label={mic.listening ? "Stop listening" : "Speak instead of typing"}
            aria-pressed={mic.listening}
            title={mic.listening ? "Stop listening" : "Speak instead of typing"}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition ${mic.listening ? "animate-pulse border-bad bg-bad/10 text-bad" : "border-line bg-bg hover:bg-surface"}`}
          >
            {mic.listening ? <Square className="h-5 w-5" aria-hidden="true" /> : <Mic className="h-5 w-5" aria-hidden="true" />}
          </button>
        )}
        <button type="submit" disabled={!input.trim() || (busy && !chatId.current)} aria-label={busy ? "Send while Claude is working" : "Send"} title={busy ? "Send now: he'll read it at his next step" : "Send"} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue text-blue-ink disabled:opacity-50">
          {busy && !input.trim() ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <ArrowUp className="h-5 w-5" aria-hidden="true" />}
        </button>
      </form>
    </section>
  );
}
