"use client";

import { signOut } from "next-auth/react";

export function SignOutButton({ className, children, label }: { className: string; children: React.ReactNode; label?: string }) {
  return (
    <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className={className} aria-label={label} title={label}>
      {children}
    </button>
  );
}
