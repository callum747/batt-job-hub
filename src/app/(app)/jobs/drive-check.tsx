"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderSync } from "lucide-react";
import { secondaryBtn } from "@/components/ui";
import { driveCheckNow } from "../actions";

/** Picks up job folders made by hand in Drive straight away, instead of waiting for the background check. */
export function DriveCheck() {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <>
      {msg && <span role="status" className="text-[15px]">{msg}</span>}
      <button
        type="button"
        disabled={pending}
        className={secondaryBtn}
        onClick={() =>
          run(async () => {
            const r = await driveCheckNow();
            setMsg(r.message);
            router.refresh();
          })
        }
      >
        <FolderSync className={`h-5 w-5 ${pending ? "animate-pulse" : ""}`} aria-hidden="true" /> {pending ? "Checking Drive…" : "Check Drive"}
      </button>
    </>
  );
}
