"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSearch, Loader2 } from "lucide-react";
import { primaryBtn } from "@/components/ui";
import { countTotals, type SavedCount } from "@/lib/drawings";
import type { DrawingFile } from "@/lib/google/drawings-run";
import { ukDate } from "@/lib/jobs-rules";

const DOT = { high: "bg-good", medium: "bg-warn", low: "bg-bad" } as const;
const WORD = { high: "Clear", medium: "Check", low: "Unsure" } as const;

export function DrawingCountPanel({ jobId, files, saved, ready }: { jobId: string; files: DrawingFile[]; saved: SavedCount | null; ready: boolean }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(() => files.filter((f) => f.electrical).map((f) => f.id));
  const [busy, setBusy] = useState(false);
  const [secs, setSecs] = useState(0);
  const [problem, setProblem] = useState("");
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? files : files.filter((f) => f.electrical || picked.includes(f.id));

  async function run() {
    setBusy(true);
    setProblem("");
    setSecs(0);
    const started = Date.now();
    const tick = setInterval(() => setSecs(Math.round((Date.now() - started) / 1000)), 1000);
    try {
      const res = await fetch("/api/count-drawings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, fileIds: picked }) });
      if (!res.ok || !res.body) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Something went wrong (${res.status}).`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      let done = false;
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { t: string; ok?: boolean; message?: string };
          if (ev.t === "done") {
            done = true;
            if (!ev.ok) setProblem(ev.message ?? "The count didn't finish.");
          }
        }
      }
      if (!done) setProblem("The connection dropped before the count finished. Reload the page in a minute: the count is saved when it's done.");
      router.refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      clearInterval(tick);
      setBusy(false);
    }
  }

  const c = saved?.count;
  return (
    <div className="space-y-4">
      {files.length === 0 ? (
        <p className="text-muted">No PDFs in this job&apos;s Drive folder yet. Put the drawings in &quot;02 - Drawings &amp; Specs&quot; and reload.</p>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-xl border border-line bg-bg">
            {shown.map((f) => (
              <li key={f.id}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-[15px] hover:bg-surface/60">
                  <input type="checkbox" className="h-4.5 w-4.5 accent-[var(--blue)]" checked={picked.includes(f.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, f.id] : p.filter((x) => x !== f.id)))} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{f.name}</span>
                    {f.folder && <span className="block truncate text-[13px] text-muted">{f.folder}</span>}
                  </span>
                  <span className="text-[13px] tabular-nums text-muted">{f.sizeKb >= 1024 ? `${(f.sizeKb / 1024).toFixed(1)} MB` : `${f.sizeKb} KB`}</span>
                </label>
              </li>
            ))}
          </ul>
          {!showAll && shown.length < files.length && (
            <button type="button" className="text-[14px] font-medium underline underline-offset-4" onClick={() => setShowAll(true)}>
              Show all {files.length} PDFs in the job folder
            </button>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy || picked.length === 0 || !ready} className={primaryBtn} onClick={run}>
              {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : <FileSearch className="h-[18px] w-[18px]" aria-hidden="true" />}
              {busy ? `Counting… ${secs}s` : saved ? "Count again" : `Count ${picked.length} drawing${picked.length === 1 ? "" : "s"}`}
            </button>
            <span className="text-[14px] text-muted">
              {!ready ? "Needs the assistant's API key." : busy ? "This can take a few minutes. You can leave the page; the count is saved when it's done." : "Tick the electrical layouts and the legend or spec. The count is a first draft for you to check."}
            </span>
          </div>
        </>
      )}
      {problem && <p role="alert" className="rounded-[10px] border border-bad/30 bg-bad/10 px-4 py-3 text-[15px]">{problem}</p>}

      {c && saved && (
        <div className="space-y-4 border-t border-line pt-4">
          <p className="text-[14px] text-muted">
            Counted {ukDate(saved.countedAt.slice(0, 10))} by {saved.by} from: {saved.files.map((f) => f.name).join("; ")}
          </p>
          <div className="rounded-[10px] border border-warn/40 bg-warn/10 px-4 py-3 text-[15px]">
            <b>Check it against the drawings before pricing.</b> A count from a drawing can miss or double-count points, most often on crowded plans. Amber and red lines need a look first.
          </div>
          <div>
            <p className="label mb-2">Totals</p>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-[15px]">
              {countTotals(c).map((t) => (
                <span key={t.description}><b className="tabular-nums">{t.qty}</b> × {t.description}</span>
              ))}
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[36rem] text-left text-[15px]">
              <thead className="border-b border-line">
                <tr>
                  <th className="label px-4 py-2.5">Room</th>
                  <th className="label px-4 py-2.5">Item</th>
                  <th className="label px-4 py-2.5 text-right">Qty</th>
                  <th className="label px-4 py-2.5">Sure?</th>
                </tr>
              </thead>
              <tbody>
                {c.rooms.flatMap((r) =>
                  r.items.map((it, i) => (
                    <tr key={`${r.floor}-${r.room}-${i}`} className="border-t border-line first:border-t-0">
                      <td className="px-4 py-2 align-top font-medium">{i === 0 ? [r.floor, r.room].filter(Boolean).join(" · ") : ""}</td>
                      <td className="px-4 py-2 align-top">
                        {it.key ? it.key : <>{it.description} <span className="rounded-full bg-surface px-2 py-0.5 text-[12.5px] text-muted">not on the price list</span></>}
                        {it.note && <span className="block text-[13.5px] text-muted">{it.note}</span>}
                      </td>
                      <td className="px-4 py-2 text-right align-top font-semibold tabular-nums">{it.qty}</td>
                      <td className="px-4 py-2 align-top">
                        <span className="inline-flex items-center gap-1.5 text-[13.5px]"><span className={`h-2 w-2 rounded-full ${DOT[it.confidence]}`} aria-hidden="true" />{WORD[it.confidence]}</span>
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          {c.questions.length > 0 && (
            <div>
              <p className="label mb-1.5">Questions to ask</p>
              <ul className="list-disc space-y-1 pl-5 text-[15px]">{c.questions.map((q) => <li key={q}>{q}</li>)}</ul>
            </div>
          )}
          {c.not_counted.length > 0 && (
            <div>
              <p className="label mb-1.5">Seen but not counted</p>
              <ul className="list-disc space-y-1 pl-5 text-[15px] text-muted">{c.not_counted.map((q) => <li key={q}>{q}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
