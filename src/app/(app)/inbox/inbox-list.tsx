"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Link2, Loader2, Plus, X } from "lucide-react";
import { Field, inputCls, primaryBtn, secondaryBtn, textareaCls } from "@/components/ui";
import { JOB_TYPES, ukDate } from "@/lib/jobs-rules";
import { unescapeHtml } from "@/lib/email";
import type { InboxItem, JobProposal, NewJobFromEmail } from "@/lib/inbox";
import { inboxCreateJob, inboxHide, inboxLink, inboxPropose } from "../actions";

type Form = Omit<NewJobFromEmail, "subject">;

function blank(it: InboxItem): Form {
  return { client_name: "", contact_name: it.from.includes("@") ? "" : it.from, contact_email: it.fromEmail, contact_phone: "", site: "", postcode: "", type: "", description: "", deadline: "" };
}

function JobForm({ item, start, missing, onCancel }: { item: InboxItem; start: Form; missing: string[]; onCancel: () => void }) {
  const [f, setF] = useState(start);
  const [pending, run] = useTransition();
  const [problem, setProblem] = useState("");
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  return (
    <div className="mt-4 space-y-4 rounded-xl bg-surface p-4">
      {missing.length > 0 && (
        <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-[15px]">
          <p className="font-semibold">Not in the email:</p>
          <ul className="list-disc pl-5">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client" hint="The company, or the person for a private job. An existing client is matched by name.">
          <input value={f.client_name} onChange={(e) => set({ client_name: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Job type">
          <select value={f.type} onChange={(e) => set({ type: e.target.value })} className={inputCls}>
            <option value="">Choose…</option>
            {JOB_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Contact name"><input value={f.contact_name} onChange={(e) => set({ contact_name: e.target.value })} className={inputCls} /></Field>
        <Field label="Contact email"><input value={f.contact_email} onChange={(e) => set({ contact_email: e.target.value })} className={inputCls} inputMode="email" /></Field>
        <Field label="Contact phone"><input value={f.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} className={inputCls} inputMode="tel" /></Field>
        <Field label="Needed by"><input type="date" value={f.deadline} onChange={(e) => set({ deadline: e.target.value })} className={inputCls} /></Field>
        <Field label="Site"><input value={f.site} onChange={(e) => set({ site: e.target.value })} className={inputCls} /></Field>
        <Field label="Postcode"><input value={f.postcode} onChange={(e) => set({ postcode: e.target.value })} className={inputCls} /></Field>
      </div>
      <Field label="What they want">
        <textarea value={f.description} onChange={(e) => set({ description: e.target.value })} className={textareaCls} />
      </Field>
      {problem && <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-[15px]">{problem}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          className={primaryBtn}
          onClick={() =>
            run(async () => {
              setProblem("");
              const r = await inboxCreateJob(item.threadId, { ...f, subject: item.subject });
              if (r && !r.ok) setProblem(r.message);
            })
          }
        >
          <Plus className="h-5 w-5" aria-hidden="true" /> {pending ? "Creating…" : "Create the job"}
        </button>
        <button type="button" className={secondaryBtn} onClick={onCancel}>Cancel</button>
      </div>
      <p className="text-[14px] text-muted">The job starts as an Enquiry with the email linked to it. It gets its number when you price it or move it on.</p>
    </div>
  );
}

function Item({ item, ai, onGone }: { item: InboxItem; ai: boolean; onGone: (msg: string) => void }) {
  const [mode, setMode] = useState<"" | "reading" | "form" | "link">("");
  const [form, setForm] = useState<{ start: Form; missing: string[] } | null>(null);
  const [ref, setRef] = useState(item.maybeJob?.ref ?? "");
  const [problem, setProblem] = useState("");
  const [pending, run] = useTransition();

  async function makeJob() {
    setProblem("");
    if (!ai) {
      setForm({ start: blank(item), missing: [] });
      setMode("form");
      return;
    }
    setMode("reading");
    const r = await inboxPropose(item.threadId);
    if (!r.ok) {
      setProblem(`${r.message} You can fill it in by hand.`);
      setForm({ start: blank(item), missing: [] });
    } else {
      const p: JobProposal = r.proposal;
      if (!p.is_job_enquiry) setProblem("This doesn't look like a job enquiry, but you can still make a job from it.");
      setForm({
        start: { client_name: p.client_name, contact_name: p.contact_name, contact_email: p.contact_email, contact_phone: p.contact_phone, site: p.site, postcode: p.postcode, type: p.type, description: p.description, deadline: p.deadline },
        missing: p.missing,
      });
    }
    setMode("form");
  }

  return (
    <li className="rounded-2xl border border-line p-4 md:p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline">
          {item.subject} <ExternalLink className="h-4 w-4 text-muted" aria-hidden="true" />
        </a>
        {item.count > 1 && <span className="text-[14px] text-muted">{item.count} emails</span>}
        <span className="ml-auto text-[14px] text-muted">{item.date ? ukDate(item.date.slice(0, 10)) : ""}</span>
      </div>
      <p className="mt-1 text-[15px]">
        {item.from} <span className="text-muted">{item.fromEmail !== item.from.toLowerCase() ? item.fromEmail : ""}</span>
      </p>
      <p className="mt-1 line-clamp-2 text-[15px] text-muted">{unescapeHtml(item.snippet)}</p>
      {item.maybeJob && <p className="mt-2 text-[14px]">From a client with an open job: {item.maybeJob.label}.</p>}

      {mode === "" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={primaryBtn} onClick={makeJob}><Plus className="h-5 w-5" aria-hidden="true" /> Make a job</button>
          <button type="button" className={secondaryBtn} onClick={() => setMode("link")}><Link2 className="h-5 w-5" aria-hidden="true" /> Add to a job</button>
          <button
            type="button"
            disabled={pending}
            className={secondaryBtn}
            onClick={() => run(async () => { await inboxHide(item.threadId); onGone("Cleared. It stays in Gmail as it was."); })}
          >
            <X className="h-5 w-5" aria-hidden="true" /> Not a job
          </button>
        </div>
      )}
      {mode === "reading" && (
        <p className="mt-4 flex items-center gap-2 text-muted"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Reading the email…</p>
      )}
      {mode === "link" && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1.5 block text-[15px] font-medium">Job number</span>
            <input value={ref} onChange={(e) => setRef(e.target.value)} className={`${inputCls} w-40`} placeholder="559" />
          </label>
          <button
            type="button"
            disabled={pending || !ref.trim()}
            className={primaryBtn}
            onClick={() =>
              run(async () => {
                const r = await inboxLink(item.threadId, ref);
                if (r.ok) onGone(r.message);
                else setProblem(r.message);
              })
            }
          >
            Add
          </button>
          <button type="button" className={secondaryBtn} onClick={() => setMode("")}>Cancel</button>
        </div>
      )}
      {problem && <p className="mt-3 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-[15px]">{problem}</p>}
      {mode === "form" && form && <JobForm item={item} start={form.start} missing={form.missing} onCancel={() => { setMode(""); setProblem(""); }} />}
    </li>
  );
}

export function InboxList({ items, ai }: { items: InboxItem[]; ai: boolean }) {
  const [gone, setGone] = useState<Record<string, string>>({});
  return (
    <ul className="space-y-4">
      {items.map((it) =>
        gone[it.threadId] ? (
          <li key={it.threadId} role="status" className="rounded-2xl border border-good/30 bg-good/10 px-4 py-3 text-[15px]">
            <b>{it.subject}</b>: {gone[it.threadId]}
          </li>
        ) : (
          <Item key={it.threadId} item={it} ai={ai} onGone={(msg) => setGone((g) => ({ ...g, [it.threadId]: msg }))} />
        ),
      )}
    </ul>
  );
}
