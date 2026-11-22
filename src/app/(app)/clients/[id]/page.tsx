import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Card, LightDot, StageBadge, jobHref } from "@/components/ui";
import { getClient, listJobsForClient } from "@/lib/data";
import { gbp } from "@/lib/money";
import { jobLabel } from "@/lib/jobs-rules";
import { ClientForm } from "../client-form";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const c = await getClient((await params).id);
  return { title: c?.name ?? "Client" };
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();
  const jobs = await listJobsForClient(id);
  const won = jobs.filter((j) => ["Booked", "In progress", "Complete", "Invoiced", "Paid"].includes(j.stage));
  const wonValue = won.reduce((s, j) => s + j.money.income, 0);
  const profit = won.reduce((s, j) => s + j.money.profit, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/clients" className="mb-4 inline-flex h-10 items-center gap-1 text-[15px] font-medium text-muted hover:text-text">
        <ChevronLeft className="h-5 w-5" aria-hidden="true" /> Clients
      </Link>
      <h1 className="text-[30px] font-semibold leading-tight">{client.name}</h1>
      <p className="mt-1 text-muted">{[client.type, client.payment_days ? `${client.payment_days} day terms` : ""].filter(Boolean).join(" · ")}</p>

      <dl className="mt-6 grid grid-cols-3 gap-3">
        {[
          ["Jobs", String(jobs.length)],
          ["Work won", gbp(wonValue, { whole: true })],
          ["Profit so far", gbp(profit, { whole: true })],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line p-4">
            <dt className="text-[14px] text-muted">{k}</dt>
            <dd className="mt-1 text-[20px] font-semibold tabular-nums md:text-[24px]">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 space-y-6">
        <Card title="Jobs">
          {jobs.length === 0 ? (
            <p className="text-muted">No jobs yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {jobs.map((j) => (
                <li key={j.id}>
                  <Link href={jobHref(j)} className="flex items-center gap-3 py-3 hover:bg-surface">
                    <span className="w-20 shrink-0 font-semibold">{jobLabel(j)}</span>
                    <span className="min-w-0 flex-1 truncate">{j.site || j.description || j.type}</span>
                    <span className="hidden sm:block"><StageBadge stage={j.stage} /></span>
                    <span className="flex w-28 items-center justify-end gap-2 tabular-nums">
                      {j.money.income ? gbp(j.money.income, { whole: true }) : "–"}
                      {j.money.income > 0 && <LightDot light={j.light} />}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Details">
          <ClientForm client={client} />
        </Card>
      </div>
    </div>
  );
}
