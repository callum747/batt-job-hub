"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { secondaryBtn } from "@/components/ui";
import { retryJobFolder } from "../actions";
import { Toast } from "./job-controls";

export function FolderButton({ jobId, label }: { jobId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={pending} className={secondaryBtn} onClick={() => start(async () => { setMsg((await retryJobFolder(jobId)).message); router.refresh(); })}>
        {pending ? "Working…" : label}
      </button>
      <Toast message={msg} />
    </div>
  );
}
