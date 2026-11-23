"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Route } from "lucide-react";
import { secondaryBtn } from "@/components/ui";
import { workOutMiles } from "../actions";

/** Works out the round-trip road miles with Google Maps and saves them on the job. */
export function MilesButton({ jobId, miles, ready }: { jobId: string; miles: number | null; ready: boolean }) {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-[15px]">
        <span className="label mr-2">Round trip</span>
        <span className="font-semibold tabular-nums">{miles === null ? "Not set" : `${miles} miles`}</span>
      </p>
      {ready ? (
        <button
          type="button"
          disabled={pending}
          className={secondaryBtn}
          onClick={() =>
            run(async () => {
              const r = await workOutMiles(jobId);
              setMsg({ ok: r.ok, text: r.message });
              if (r.ok) router.refresh();
            })
          }
        >
          <Route className="h-[18px] w-[18px]" aria-hidden="true" /> {pending ? "Asking Google Maps…" : miles === null ? "Work out miles" : "Work out again"}
        </button>
      ) : (
        <span className="text-[14px] text-muted">Add GOOGLE_MAPS_API_KEY in Replit Secrets to work miles out automatically.</span>
      )}
      {msg && <p role="status" className={`w-full rounded-[10px] border px-4 py-2.5 text-[15px] ${msg.ok ? "border-good/30 bg-good/10" : "border-bad/30 bg-bad/10"}`}>{msg.text}</p>}
    </div>
  );
}
