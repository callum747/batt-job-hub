import Link from "next/link";
import { FolderOpen, Truck } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";
import { Card, secondaryBtn } from "@/components/ui";
import { getPeople } from "@/lib/data";
import { todayUK } from "@/lib/jobs-rules";
import { dueItems, dueText, type Vehicle } from "@/lib/vehicles";
import { listVehicles, vehiclesFolderUrl } from "@/lib/vehicles-run";
import { VehicleForm } from "./forms";

export const metadata = { title: "Vehicles" };

const tone = { overdue: "bg-bad/10 text-bad border-bad/30", soon: "bg-warn/10 border-warn/40", ok: "bg-surface border-line" } as const;

export default async function VehiclesPage() {
  const [vehicles, people, folderUrl] = await Promise.all([listVehicles(true), getPeople(), vehiclesFolderUrl()]);
  const today = todayUK();
  const staff = people.map((p) => ({ id: p.id, short_name: p.short_name }));
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Vehicles"
        intro="The vans: who drives each one, what's due and when. Open one for its log and documents."
        action={
          folderUrl ? (
            <a href={folderUrl} target="_blank" rel="noreferrer" className={secondaryBtn}>
              <FolderOpen className="h-5 w-5 text-blue" aria-hidden="true" /> Vehicles folder
            </a>
          ) : undefined
        }
      />
      {vehicles.length === 0 && <EmptyState icon={Truck} title="No vehicles yet" text="Add each van below. Put in the dates you want reminding about; anything due within 30 days shows on Today." />}
      <ul className="grid gap-3 md:grid-cols-2">
        {vehicles.map((v: Vehicle) => {
          const due = dueItems(v, today).filter((d) => d.state !== "ok");
          return (
            <li key={v.id}>
              <Link href={`/vehicles/${v.id}`} className="block h-full rounded-2xl border border-line bg-bg p-5 shadow-card hover:bg-surface">
                <p className="text-[18px] font-semibold">{v.name}{v.active ? "" : " (no longer ours)"}</p>
                <p className="text-[15px] text-muted">{[v.registration, v.make_model, v.driver ? `driven by ${v.driver}` : ""].filter(Boolean).join(" · ") || "No details yet"}</p>
                {due.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {due.map((d) => (
                      <li key={d.what} className={`rounded-lg border px-3 py-1.5 text-[14px] font-semibold ${tone[d.state]}`}>{dueText(d)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-[14px] text-muted">Nothing due in the next 30 days.</p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <Card title="Add a vehicle">
        <VehicleForm vehicle={null} people={staff} />
      </Card>
    </div>
  );
}
