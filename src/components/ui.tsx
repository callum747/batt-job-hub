import Link from "next/link";
import type { Light } from "@/lib/money";
import type { Stage } from "@/lib/jobs-rules";

type P = { id: string; short_name: string; colour: string };

/**
 * Stage badges read at a glance, in brand colours only: an outline while it's an enquiry, blue while it's a
 * quote, solid black once the work is on, steel when it's finished and waiting for money, green when paid.
 */
const STAGE_STYLE: Record<Stage, { box: string; dot: string }> = {
  Enquiry: { box: "border border-line-strong bg-bg text-text", dot: "bg-line-strong" },
  "Draft quote": { box: "bg-blue-soft text-text", dot: "border border-blue bg-bg" },
  Quoted: { box: "bg-blue-soft text-text", dot: "bg-blue" },
  Booked: { box: "bg-text text-white", dot: "bg-white/50" },
  "In progress": { box: "bg-text text-white", dot: "bg-blue" },
  Complete: { box: "bg-muted text-white", dot: "bg-white/60" },
  Invoiced: { box: "bg-muted text-white", dot: "bg-warn" },
  Paid: { box: "bg-good/12 text-text", dot: "bg-good" },
  "On hold": { box: "border border-dashed border-line-strong bg-bg text-muted", dot: "bg-warn" },
  Lost: { box: "bg-surface text-muted", dot: "bg-line-strong" },
  Closed: { box: "bg-surface text-muted", dot: "bg-line-strong" },
};

export function StageBadge({ stage }: { stage: Stage }) {
  const st = STAGE_STYLE[stage] ?? STAGE_STYLE.Enquiry;
  return (
    <span className={`inline-flex h-6.5 items-center gap-1.5 whitespace-nowrap rounded-full pl-2 pr-2.5 text-[12.5px] font-semibold ${st.box}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`} aria-hidden="true" />
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

/** A person: a quiet white tag with their colour as a dot, so a row of people never shouts. */
export function PersonChip({ person, size = "md" }: { person: P; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-bg font-medium text-text ${size === "sm" ? "h-6.5 pl-2 pr-2.5 text-[12.5px]" : "h-8 pl-2.5 pr-3 text-[13.5px]"}`}
      title={person.short_name}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: person.colour }} aria-hidden="true" />
      {person.short_name}
    </span>
  );
}

/** People on a job. In a tight row (a table) they're names with a colour dot; elsewhere, named tags. */
export function PeopleChips({ ids, people, size, nowrap }: { ids: string[]; people: P[]; size?: "sm" | "md"; nowrap?: boolean }) {
  const list = people.filter((p) => ids.includes(p.id));
  if (list.length === 0) return <span className="whitespace-nowrap text-[13.5px] text-muted">Nobody yet</span>;
  if (nowrap) {
    // A tight row (a table): names with their colour dot, no boxes.
    return (
      <span className="flex items-center gap-3 text-[13.5px] font-medium">
        {list.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.colour }} aria-hidden="true" />
            {p.short_name}
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {list.map((p) => (
        <PersonChip key={p.id} person={p} size={size} />
      ))}
    </span>
  );
}

export function Card({ title, action, children, className = "" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-line bg-bg shadow-card ${className}`}>
      {title && (
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="bar-title text-[16px] font-semibold">{title}</h2>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** A headline figure: small tracked label, the number in the headline face, a line of support. */
export function Stat({ label, value, sub, light, href }: { label: string; value: string; sub?: React.ReactNode; light?: Light; href?: string }) {
  const body = (
    <>
      <p className="label flex items-center gap-2 max-md:text-[10px] max-md:tracking-[0.05em]">
        {label}
        {light && <LightDot light={light} className="h-2 w-2" />}
      </p>
      <p className="headline mt-1.5 text-[16px] tabular-nums min-[400px]:text-[17px] md:mt-2 md:text-[26px]">{value}</p>
      {sub && <p className="mt-0.5 text-[12.5px] text-muted md:mt-1 md:text-[13px]">{sub}</p>}
    </>
  );
  const cls = "block min-w-0 rounded-2xl border border-line bg-bg p-3 shadow-card md:p-5";
  return href ? (
    <Link href={href} className={`${cls} transition hover:border-line-strong hover:shadow-lift`}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[14px] font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[13px] leading-snug text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "h-11 w-full rounded-[10px] border border-line-strong bg-bg px-3.5 text-[16px] outline-none transition placeholder:text-muted/70 hover:border-muted/60 focus:border-blue focus:ring-3 focus:ring-blue/20";
export const textareaCls =
  "min-h-28 w-full rounded-[10px] border border-line-strong bg-bg px-3.5 py-2.5 text-[16px] outline-none transition placeholder:text-muted/70 hover:border-muted/60 focus:border-blue focus:ring-3 focus:ring-blue/20";
export const primaryBtn =
  "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] bg-blue px-4.5 text-[15px] font-semibold text-blue-ink shadow-card transition hover:brightness-95 active:brightness-90 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryBtn =
  "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-line-strong bg-bg px-4.5 text-[15px] font-medium shadow-card transition hover:bg-surface active:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";

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
