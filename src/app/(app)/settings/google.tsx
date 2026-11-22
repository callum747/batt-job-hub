"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { ConnectGoogleButton } from "@/components/connect-google";
import { primaryBtn, secondaryBtn } from "@/components/ui";
import { checkGoogle, setGoogleMode, type Check } from "../actions";
import { Toast } from "../jobs/job-controls";

export function GoogleSettings({ connected, mode, preview }: { connected: boolean; mode: "test" | "live"; preview: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);

  return (
    <div className="space-y-5">
      <div>
        <p className="font-medium">{connected ? "Google Drive and Calendar are connected for you." : "Google Drive and Calendar aren't connected for you yet."}</p>
        <p className="mt-1 text-[15px] text-muted">
          Each person connects once. It lets the app make and move job folders, list their files, and put visits in the calendar, as you.
        </p>
        {!preview && (
          <ConnectGoogleButton className={`${connected ? secondaryBtn : primaryBtn} mt-3`}>{connected ? "Connect again" : "Connect Google"}</ConnectGoogleButton>
        )}
      </div>

      <div className="rounded-xl border border-line p-4">
        <p className="font-semibold">{mode === "test" ? "Test mode is on" : "Live: using the real folders and calendar"}</p>
        <p className="mt-1 text-[15px] text-muted">
          {mode === "test"
            ? "New job folders go in “ZZ – Job Hub TEST” in the shared drive, and visits go in a “Job Hub TEST” calendar. Your real job folders and the real shared calendar are not touched."
            : "New job folders go in Enquiries & Tenders and Projects, folders move when a job's stage changes, and visits go in the shared “Batt Electrical Job's” calendar."}
        </p>
        <button
          type="button"
          disabled={pending}
          className={`${secondaryBtn} mt-3`}
          onClick={() => {
            const next = mode === "test" ? "live" : "test";
            if (next === "live" && !confirm("Go live? From now on the app will make and move folders in the real job folders, and put visits in the real shared calendar, inviting whoever is on them.")) return;
            start(async () => {
              setMsg((await setGoogleMode(next)).message);
              router.refresh();
            });
          }}
        >
          {mode === "test" ? "Go live" : "Back to test mode"}
        </button>
      </div>

      <div>
        <button type="button" disabled={pending} className={secondaryBtn} onClick={() => start(async () => setChecks(await checkGoogle()))}>
          {pending ? "Checking…" : "Check the connection"}
        </button>
        {checks && (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {checks.map((c) => (
              <li key={c.label} className="flex items-start gap-3 px-4 py-3 text-[15px]">
                {c.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-good" aria-label="Working" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-bad" aria-label="Problem" />}
                <span>
                  <span className="font-medium">{c.label}</span>
                  <span className="block text-muted">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Toast message={msg} />
    </div>
  );
}
