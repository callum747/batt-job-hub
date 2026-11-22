import Link from "next/link";
import type { Light } from "@/lib/money";
import type { Stage } from "@/lib/jobs-rules";

type P = { id: string; short_name: string; colour: string };

export function StageBadge({ stage }: { stage: Stage }) {
  const quiet = stage === "Lost" || stage === "Closed" || stage === "On hold" || stage === "Paid";
  return (
    <span
      className={`inline-flex h-7 items-center whitespace-nowrap rounded-full px-3 text-[13px] font-medium ${
        quiet ? "bg-surface text-muted" : "bg-blue-soft text-text"
      }`}
    >
      {stage}
    </span>
  );
}

const LIGHT: Record<Light, { cls: string; label: string }> = {
  green: { cls: "bg-good", label: "Healthy margin" },
  amber: { cls: "bg-warn", label: "Thin margin" },
  red: { cls: "bg-bad", label: "Losing money or close to it" },
  none: { cls: "bg-line", label: "No quote yet" },
};

export function LightDot({ light, className = "h-3 w-3" }: { light: Light; className?: string }) {
  return <span className={`inline-block shrink-0 rounded-full ${LIGHT[light].cls} ${className}`} title={LIGHT[light].label} aria-label={LIGHT[light].label} role="img" />;
}

export function PersonChip({ person, size = "md" }: { person: P; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-semibold text-white ${size === "sm" ? "h-7 min-w-7 px-2 text-[12px]" : "h-8 min-w-8 px-2.5 text-[13px]"}`}
      style={{ backgroundColor: person.colour }}
      title={person.short_name}
    >
      {person.short_name}
    </span>
  );
}

export function PeopleChips({ ids, people, size, nowrap }: { ids: string[]; people: P[]; size?: "sm" | "md"; nowrap?: boolean }) {
  const list = people.filter((p) => ids.includes(p.id));
  if (list.length === 0) return <span className="whitespace-nowrap text-[14px] text-muted">Nobody yet</span>;
  return (
    <span className={`flex gap-1.5 ${nowrap ? "" : "flex-wrap"}`}>
      {list.map((p) => (
        <PersonChip key={p.id} person={p} size={size} />
      ))}
    </span>
  );
}

export function Card({ title, action, children, className = "" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-bg ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-[18px] font-semibold">{title}</h2>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[15px] font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[14px] text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "h-12 w-full rounded-xl border border-line bg-bg px-4 text-[16px] outline-none placeholder:text-muted focus:border-blue";
export const textareaCls =
  "min-h-28 w-full rounded-xl border border-line bg-bg px-4 py-3 text-[16px] outline-none placeholder:text-muted focus:border-blue";
export const primaryBtn =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue px-5 text-[16px] font-semibold text-blue-ink transition hover:brightness-95 disabled:opacity-60";
export const secondaryBtn =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-bg px-5 text-[16px] font-medium transition hover:bg-surface disabled:opacity-60";

export function ButtonLink({ href, children, primary }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <Link href={href} className={primary ? primaryBtn : secondaryBtn}>
      {children}
    </Link>
  );
}

export function jobHref(j: { id: string; number: number | null; legacy_ref?: string }) {
  return `/jobs/${j.number ?? (j.legacy_ref || j.id)}`;
}
