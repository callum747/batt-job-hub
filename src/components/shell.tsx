"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Search } from "lucide-react";
import { NAV, isActive } from "./nav-items";

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

export function Shell({ person, preview, children }: { person: Person; preview: boolean; children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh md:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-bg md:flex">
        <div className="flex h-20 items-center px-6">
          <Link href="/" aria-label="Today">
            <Logo />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-12 items-center gap-3 rounded-xl px-4 text-[16px] font-medium transition ${
                  active ? "bg-blue-soft text-text" : "text-muted hover:bg-surface hover:text-text"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "text-blue" : ""}`} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold">
              {initials(person.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">{person.name}</p>
              <p className="truncate text-[13px] text-muted">{person.email}</p>
            </div>
            {!preview && (
              <form action="/auth/signout" method="post">
                <button type="submit" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text" aria-label="Sign out" title="Sign out">
                  <LogOut className="h-5 w-5" aria-hidden="true" />
                </button>
              </form>
            )}
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 md:h-20 md:px-8">
          <Link href="/" className="md:hidden" aria-label="Today">
            <Logo className="h-7 w-auto" />
          </Link>
          <label className="relative ml-auto flex h-12 w-full max-w-md items-center md:ml-0">
            <span className="sr-only">Search jobs, clients and sites</span>
            <Search className="pointer-events-none absolute left-4 h-5 w-5 text-muted" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search jobs, clients, sites"
              className="h-12 w-full rounded-xl border border-line bg-surface pl-12 pr-4 text-[16px] outline-none placeholder:text-muted focus:border-blue focus:bg-bg"
            />
          </label>
        </div>
        {preview && (
          <p className="bg-surface px-4 py-2 text-center text-[14px] text-muted md:px-8">
            Preview on this computer only. Sign-in switches on once Supabase and Google are set up.
          </p>
        )}
      </header>

      <main className="px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-8">{children}</main>

      {/* Phone tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Main"
      >
        <ul className="grid grid-cols-5">
          {NAV.filter((n) => n.phone).map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-medium ${active ? "text-blue" : "text-muted"}`}
                >
                  <Icon className="h-6 w-6" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href="/more"
              aria-current={isActive(pathname, "/more") ? "page" : undefined}
              className={`flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-medium ${isActive(pathname, "/more") ? "text-blue" : "text-muted"}`}
            >
              <Menu className="h-6 w-6" aria-hidden="true" />
              More
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
