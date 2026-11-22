"use client";

import { signIn } from "next-auth/react";
import { usePathname } from "next/navigation";

/** Sends the person to Google to tick the Drive and Calendar permission. */
export function ConnectGoogleButton({ className, children }: { className: string; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <button type="button" className={className} onClick={() => signIn("google", { callbackUrl: pathname }, { prompt: "consent", access_type: "offline" })}>
      {children}
    </button>
  );
}
