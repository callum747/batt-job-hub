import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page";
import { ButtonLink } from "@/components/ui";
import { listClients } from "@/lib/data";
import { gbp } from "@/lib/money";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const clients = await listClients();
  return (
    <>
      <PageHeader
        title="Clients"
        intro="Who we work for, their terms and their jobs."
        action={
          <ButtonLink href="/clients/new" primary>
            <Plus className="h-5 w-5" aria-hidden="true" /> New client
          </ButtonLink>
        }
      />
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {clients.map((c) => (
          <li key={c.id}>
            <Link href={`/clients/${c.id}`} className="block h-full rounded-2xl border border-line bg-bg shadow-card p-5 hover:bg-surface">
              <p className="text-[18px] font-semibold">{c.name}</p>
              <p className="text-[15px] text-muted">{[c.type, c.contact !== c.name ? c.contact : ""].filter(Boolean).join(" · ") || "No details yet"}</p>
              <p className="mt-3 text-[15px]">
                {c.jobs} job{c.jobs === 1 ? "" : "s"}
                {c.open_jobs > 0 && <span className="text-muted"> · {c.open_jobs} open</span>}
                {c.won_value > 0 && <span className="text-muted"> · {gbp(c.won_value, { whole: true })} won</span>}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
