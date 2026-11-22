"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GoogleButton({ domain }: { domain: string }) {
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Tells Google to offer only Batt accounts. The server checks again after sign-in.
        queryParams: { hd: domain, prompt: "select_account" },
      },
    });
    if (error) setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={signIn}
      disabled={busy}
      className="flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-blue text-[17px] font-semibold text-blue-ink transition hover:brightness-95 disabled:opacity-60"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
        <path fill="currentColor" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.7 14.55 2.75 12 2.75 6.9 2.75 2.75 6.9 2.75 12S6.9 21.25 12 21.25c5.34 0 8.88-3.75 8.88-9.04 0-.6-.07-1.06-.15-1.51z" />
      </svg>
      {busy ? "Opening Google…" : "Sign in with Google"}
    </button>
  );
}
