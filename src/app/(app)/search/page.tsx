import Link from "next/link";
import { LightDot, StageBadge, jobHref } from "@/components/ui";
import { PageHeader } from "@/components/page";
import { searchEverything } from "@/lib/data";
import { gbp } from "@/lib/money";
import { jobLabel } from "@/lib/jobs-rules";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { jobs, clients } = await searchEverything(q);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={q ? `Results for “${q}”` : "Search"} intro={q ? `${jobs.length} job${jobs.length === 1 ? "" : "s"}, ${clients.length} client${clients.length === 1 ? "" : "s"}` : "Type a job number, client, site, postcode or anything in the notes."} />
      {clients.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-[18px] font-semibold">Clients</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-bg shadow-card">
            {clients.map((c) => (
              <li key={c.id}>
                <Link href={`/clients/${c.id}`} className="block px-5 py-3 hover:bg-surface">
                  <span className="font-medium">{c.name}</span> <span className="text-muted">{c.type}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {jobs.length > 0 && (
        <section>
          <h2 className="mb-2 text-[18px] font-semibold">Jobs</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-bg shadow-card">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link href={jobHref(j)} className="flex items-center gap-3 px-5 py-3 hover:bg-surface">
                  <span className="w-20 shrink-0 font-semibold">{jobLabel(j)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{j.client_name || "No client"}</span>
                    <span className="block truncate text-[15px] text-muted">{j.site || j.description}</span>
                  </span>
                  <span className="hidden sm:block"><StageBadge stage={j.stage} /></span>
                  {j.money.income > 0 && (
                    <span className="flex items-center gap-2 tabular-nums">{gbp(j.money.income, { whole: true })} <LightDot light={j.light} /></span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {q && jobs.length === 0 && clients.length === 0 && <p className="rounded-2xl bg-surface px-5 py-10 text-center text-muted">Nothing found.</p>}
    </div>
  );
}
