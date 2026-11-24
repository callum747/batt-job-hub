"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Phone } from "lucide-react";
import { chaseQuote, quoteChasedByHand } from "./actions";

const btn = "inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-bg px-3 text-[14px] font-medium hover:bg-surface disabled:opacity-50";

/** For a quote that's due a chase: draft the email in Gmail, or note that it was chased by phone. */
export function ChaseButtons({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string; url?: string } | null>(null);
  if (result?.ok) {
    return (
      <p role="status" className="mt-2 rounded-lg bg-blue-soft px-3 py-2 text-[14px]">
        {result.message}{" "}
        {result.url && (
          <a href={result.url} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">
            Open the draft
          </a>
        )}
      </p>
    );
  }
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className={btn}
          onClick={() =>
            start(async () => {
              const r = await chaseQuote(jobId);
              setResult(r);
              if (r.ok) router.refresh();
            })
          }
        >
          <Mail className="h-4 w-4" aria-hidden="true" /> {pending ? "Working…" : "Draft chaser"}
        </button>
        <button
          type="button"
          disabled={pending}
          className={btn}
          onClick={() =>
            start(async () => {
              const r = await quoteChasedByHand(jobId);
              setResult(r);
              router.refresh();
            })
          }
        >
          <Phone className="h-4 w-4" aria-hidden="true" /> I&apos;ve chased it
        </button>
      </div>
      {result && !result.ok && <p role="alert" className="mt-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[14px]">{result.message}</p>}
    </div>
  );
}
