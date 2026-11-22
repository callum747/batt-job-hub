"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { STAGES, type Stage } from "@/lib/jobs-rules";
import { gbp } from "@/lib/money";
import type { ClientRow, PersonRow, VariationRow } from "@/lib/data";
import { addNote, addVariation, deleteVariation, setPeople, setStage, setVariationApproved } from "../actions";
import { Field, inputCls, primaryBtn, secondaryBtn, textareaCls } from "@/components/ui";

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-xl bg-blue-soft px-4 py-3 text-[15px] font-medium">
      {message}
    </p>
  );
}

export function StageControl({ jobId, stage }: { jobId: string; stage: Stage }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="sr-only">Stage</span>
        <select
          value={stage}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as Stage;
            start(async () => {
              try {
                const r = await setStage(jobId, next);
                if (r.numbered) {
                  router.replace(`/jobs/${r.number}?numbered=1`);
                } else {
                  setMsg(r.message);
                  router.refresh();
                }
              } catch (err) {
                setMsg((err as Error).message);
              }
            });
          }}
          className="h-12 w-full rounded-xl border border-line bg-bg px-4 text-[16px] font-medium outline-none focus:border-blue sm:w-56"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <Toast message={msg} />
    </div>
  );
}

export function PeopleControl({ jobId, selected, people }: { jobId: string; selected: string[]; people: PersonRow[] }) {
  const router = useRouter();
  const [ids, setIds] = useState(selected);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2" aria-busy={pending}>
      {people.map((p) => {
        const on = ids.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            onClick={() => {
              const next = on ? ids.filter((i) => i !== p.id) : [...ids, p.id];
              setIds(next);
              start(async () => {
                await setPeople(jobId, next);
                router.refresh();
              });
            }}
            className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[15px] font-medium transition ${
              on ? "border-transparent text-white" : "border-line text-muted hover:text-text"
            }`}
            style={on ? { backgroundColor: p.colour } : undefined}
          >
            {on && <Check className="h-4 w-4" aria-hidden="true" />}
            {p.short_name}
          </button>
        );
      })}
    </div>
  );
}

export function NoteForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState("");
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          await addNote(jobId, f);
          setValue("");
          router.refresh();
        });
      }}
    >
      <label className="flex-1">
        <span className="sr-only">Add a note</span>
        <input name="note" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Add a note, for example: Rang Gwen, starting Monday" className={inputCls} />
      </label>
      <button type="submit" disabled={pending || !value.trim()} className={secondaryBtn}>
        Add note
      </button>
    </form>
  );
}

export function Variations({ jobId, items }: { jobId: string; items: VariationRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  return (
    <div className="space-y-4" aria-busy={pending}>
      {items.length === 0 && !adding && <p className="text-muted">No extras on this job.</p>}
      {items.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {items.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{v.description}</p>
                <p className="text-[14px] text-muted">{v.approved ? "Approved, counted in the job total" : "Not approved yet, not counted"}</p>
              </div>
              <span className="tabular-nums font-medium">{gbp(v.amount)}</span>
              <button type="button" onClick={() => run(() => setVariationApproved(v.id, !v.approved))} className={`${secondaryBtn} h-10 px-3 text-[14px]`}>
                {v.approved ? "Mark not approved" : "Mark approved"}
              </button>
              <button
                type="button"
                onClick={() => confirm(`Remove "${v.description}"?`) && run(() => deleteVariation(v.id))}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-bad"
                aria-label={`Remove ${v.description}`}
              >
                <Trash2 className="h-5 w-5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form
          className="grid gap-3 rounded-xl bg-surface p-4 sm:grid-cols-[1fr_10rem]"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(async () => {
              await addVariation(jobId, f);
              setAdding(false);
            });
          }}
        >
          <Field label="What's the extra?">
            <input name="description" required className={inputCls} placeholder="2 extra double sockets in the kitchen" />
          </Field>
          <Field label="Amount ex VAT">
            <input name="amount" inputMode="decimal" required className={inputCls} placeholder="0.00" />
          </Field>
          <label className="flex items-center gap-3 text-[16px] sm:col-span-2">
            <input type="checkbox" name="approved" className="h-5 w-5 accent-[var(--blue)]" /> The client has approved it
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className={primaryBtn} disabled={pending}>Add extra</button>
            <button type="button" className={secondaryBtn} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={secondaryBtn}>
          Add an extra
        </button>
      )}
    </div>
  );
}

export function ClientPicker({ clients, value }: { clients: Pick<ClientRow, "id" | "name">[]; value: string | null }) {
  const [choice, setChoice] = useState(value ?? "");
  return (
    <div className="space-y-3">
      <select name="client_id" value={choice} onChange={(e) => setChoice(e.target.value)} className={inputCls}>
        <option value="">No client yet</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value="new">+ A new client…</option>
      </select>
      {choice === "new" && <input name="new_client" required autoFocus placeholder="New client's name" className={inputCls} />}
    </div>
  );
}

export function NotesText({ notes }: { notes: string }) {
  if (!notes.trim()) return <p className="text-muted">No notes yet.</p>;
  return (
    <ul className="space-y-2">
      {notes
        .split("\n")
        .filter((l) => l.trim())
        .reverse()
        .map((line, i) => (
          <li key={i} className="rounded-xl bg-surface px-4 py-3 text-[15px] leading-relaxed">
            {line}
          </li>
        ))}
    </ul>
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={textareaCls} />;
}
