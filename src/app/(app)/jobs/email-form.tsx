"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Mail, Paperclip } from "lucide-react";
import { Field, inputCls, primaryBtn, textareaCls } from "@/components/ui";
import type { EmailStart } from "@/lib/quote-email";
import { draftEmail } from "../actions";

export function EmailDraftForm({ jobId, start }: { jobId: string; start: EmailStart }) {
  const [pending, run] = useTransition();
  const [e, setE] = useState({ to: start.to, cc: start.cc, subject: start.subject, body: start.body });
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  const set = (patch: Partial<typeof e>) => setE((x) => ({ ...x, ...patch }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="To" hint={start.to ? undefined : "No email on the client or job yet. Type it in, and add it to the client so it's there next time."}>
          <input type="text" inputMode="email" value={e.to} onChange={(x) => set({ to: x.target.value })} className={inputCls} placeholder="client@example.com" />
        </Field>
        <Field label="Cc">
          <input type="text" inputMode="email" value={e.cc} onChange={(x) => set({ cc: x.target.value })} className={inputCls} />
        </Field>
      </div>
      <Field label="Subject">
        <input value={e.subject} onChange={(x) => set({ subject: x.target.value })} className={inputCls} />
      </Field>
      <Field label="Message">
        <textarea value={e.body} onChange={(x) => set({ body: x.target.value })} className={`${textareaCls} min-h-72`} />
      </Field>
      <p className="flex items-center gap-2 text-[15px]">
        <Paperclip className="h-4 w-4 text-muted" aria-hidden="true" />
        <a href={start.pdfUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">{start.pdfName}</a>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || !e.to.trim()}
          className={primaryBtn}
          onClick={() =>
            run(async () => {
              setMsg(null);
              const r = await draftEmail(jobId, start.documentId, e);
              setMsg({ ok: r.ok, text: r.message, url: r.url });
            })
          }
        >
          <Mail className="h-5 w-5" aria-hidden="true" /> {pending ? "Saving the draft…" : "Save as a draft in Gmail"}
        </button>
        <span className="text-[14px] text-muted">Nothing is sent. You check it and press Send in Gmail.</span>
      </div>
      {msg && (
        <div role="status" className={`rounded-xl border px-4 py-3 text-[15px] ${msg.ok ? "border-good/30 bg-good/10" : "border-bad/30 bg-bad/10"}`}>
          {msg.text}{" "}
          {msg.url && (
            <a href={msg.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold underline underline-offset-4">
              Open the draft <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
