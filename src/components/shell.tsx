"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Search } from "lucide-react";
import { NAV, NAV_GROUPS, isActive } from "./nav-items";
import { SignOutButton } from "./sign-out";
import { ConnectGoogleButton } from "./connect-google";

type Person = { name: string; email: string };

function Logo({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <>
      <Image src="/brand/batt-horizontal-batt-colour.svg" alt="Batt" width={120} height={45} className={`logo-light ${className}`} priority />
      <Image src="/brand/batt-horizontal-batt-reversed.svg" alt="Batt" width={120} height={45} className={`logo-dark ${className}`} priority />
    </>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function Shell({ person, preview, googleNote, children }: { person: Person; preview: boolean; googleNote?: string | null; children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh md:pl-60">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-bg md:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/" aria-label="Today">
            <Logo className="h-7 w-auto" />
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
          {NAV_GROUPS.map((group) => (
            <div key={group} className="mt-4 first:mt-1">
              <p className="label px-3 pb-1.5">{group}</p>
              <ul className="space-y-0.5">
                {NAV.filter((n) => n.group === group).map(({ href, label, icon: Icon }) => {
                  const active = isActive(pathname, href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={`relative flex h-10 items-center gap-3 rounded-lg px-3 text-[15px] transition ${
                          active ? "bg-surface font-semibold text-text" : "font-medium text-muted hover:bg-surface hover:text-text"
                        }`}
                      >
                        {/* The brand's blue bar marks where you are. */}
                        {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-blue" aria-hidden="true" />}
                        <Icon className={`h-[18px] w-[18px] ${active ? "text-text" : ""}`} strokeWidth={active ? 2.25 : 2} aria-hidden="true" />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-text text-[12.5px] font-semibold text-white">
              {initials(person.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold leading-tight">{person.name}</p>
              <p className="truncate text-[12.5px] text-muted">{person.email}</p>
            </div>
            {!preview && (
              <SignOutButton label="Sign out" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text">
                <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
              </SignOutButton>
            )}
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 md:px-8">
          <Link href="/" className="md:hidden" aria-label="Today">
            <Logo className="h-7 w-auto" />
          </Link>
          <form action="/search" role="search" className="ml-auto w-full max-w-md md:ml-0">
            <label className="relative flex h-10 w-full items-center">
              <span className="sr-only">Search jobs, clients and sites</span>
              <Search className="pointer-events-none absolute left-3.5 h-[18px] w-[18px] text-muted" aria-hidden="true" />
              <input
                type="search"
                name="q"
                placeholder="Search jobs, clients, sites"
                className="h-10 w-full rounded-[10px] border border-transparent bg-surface pl-10 pr-4 text-[15px] outline-none transition placeholder:text-muted focus:border-blue focus:bg-bg focus:ring-3 focus:ring-blue/20"
              />
            </label>
          </form>
        </div>
        {googleNote && (
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-blue/20 bg-blue-soft px-4 py-2 text-center text-[14px] md:px-8">
            {googleNote}
            <ConnectGoogleButton className="font-semibold underline underline-offset-4">Connect Google</ConnectGoogleButton>
          </p>
        )}
        {preview && (
          <p className="border-t border-line bg-surface px-4 py-1.5 text-center text-[13px] text-muted md:px-8">
            Preview on this computer only. Sign-in switches on once Google is set up.
          </p>
        )}
      </header>

      <main className="mx-auto max-w-[1400px] px-4 pb-28 pt-6 md:px-8 md:pb-14 md:pt-8">{children}</main>

      {/* Phone tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Main"
      >
        <ul className="grid grid-cols-5">
          {[...NAV.filter((n) => n.phone).map((n) => ({ href: n.href as string, label: n.label as string, icon: n.icon })), { href: "/more", label: "More", icon: Menu }].map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-[60px] flex-col items-center justify-center gap-1 text-[11.5px] ${active ? "font-semibold text-text" : "font-medium text-muted"}`}
                >
                  {active && <span className="absolute inset-x-6 top-0 h-[3px] rounded-b-full bg-blue" aria-hidden="true" />}
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 2} aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
