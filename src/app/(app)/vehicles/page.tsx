import { FileText, FolderOpen, Truck } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";
import { Card, secondaryBtn } from "@/components/ui";
import { currentPerson } from "@/lib/auth";
import { getPeople } from "@/lib/data";
import { googleConnected } from "@/lib/google/client";
import type { DriveFile } from "@/lib/google/drive";
import { todayUK, ukDate } from "@/lib/jobs-rules";
import { dueItems, dueText, type Vehicle } from "@/lib/vehicles";
import { listVehicles, vehicleFiles, vehiclesFolderUrl } from "@/lib/vehicles-run";
import { VehicleFolderButton, VehicleForm } from "./forms";

export const metadata = { title: "Vehicles" };

const tone = { overdue: "bg-bad/10 text-bad border-bad/30", soon: "bg-warn/10 border-warn/40", ok: "bg-surface border-line" } as const;

export default async function VehiclesPage() {
  const [vehicles, people, me, folderUrl] = await Promise.all([listVehicles(true), getPeople(), currentPerson(), vehiclesFolderUrl()]);
  const connected = me && me.email !== "preview@localhost" ? await googleConnected(me.email) : false;
  const today = todayUK();
  const files = new Map<string, DriveFile[]>();
  if (connected) {
    await Promise.all(
      vehicles.filter((v) => v.drive_folder_id).map(async (v) => {
        try {
          files.set(v.id, await vehicleFiles(me!.email, v.drive_folder_id));
        } catch {
          // The folder may have been moved or removed by hand: the vehicle still shows, just without its files.
        }
      }),
    );
  }
  const staff = people.map((p) => ({ id: p.id, short_name: p.short_name }));
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Vehicles"
        intro="The vans: who drives each one, what's due and when, and its paperwork in Drive."
        action={
          folderUrl ? (
            <a href={folderUrl} target="_blank" rel="noreferrer" className={secondaryBtn}>
              <FolderOpen className="h-5 w-5 text-blue" aria-hidden="true" /> Vehicles folder
            </a>
          ) : undefined
        }
      />
      {vehicles.length === 0 && <EmptyState icon={Truck} title="No vehicles yet" text="Add each van below. Put in the dates you want reminding about; anything due within 30 days shows on Today." />}
      {vehicles.map((v: Vehicle) => {
        const due = dueItems(v, today);
        const mine = files.get(v.id);
        return (
          <Card key={v.id} title={`${v.name}${v.active ? "" : " (no longer ours)"}`}>
            <p className="text-[15px] text-muted">{[v.registration, v.make_model, v.driver ? `driven by ${v.driver}` : ""].filter(Boolean).join(" · ") || "No details yet"}</p>
            {due.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {due.map((d) => (
                  <li key={d.what} className={`rounded-lg border px-3 py-2 text-[14px] ${tone[d.state]}`}>
                    <span className="font-semibold">{d.state === "ok" ? d.what : dueText(d)}</span>
                    <span className="block text-[13px] opacity-80">{ukDate(d.on)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {v.drive_folder_url ? (
                <a href={v.drive_folder_url} target="_blank" rel="noreferrer" className={secondaryBtn}>
                  <FolderOpen className="h-5 w-5 text-blue" aria-hidden="true" /> Open its folder
                </a>
              ) : connected ? (
                <VehicleFolderButton id={v.id} />
              ) : (
                <span className="text-[14px] text-muted">Connect Google in Settings to give it a Drive folder.</span>
              )}
            </div>
            {mine && mine.length > 0 && (
              <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-bg">
                {mine.map((f) => (
                  <li key={f.id}>
                    <a href={f.webViewLink} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-2.5 text-[15px] hover:bg-surface">
                      <FileText className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="shrink-0 text-[13px] text-muted">{ukDate(f.modifiedTime?.slice(0, 10))}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {mine && mine.length === 0 && <p className="mt-3 text-[14px] text-muted">Nothing in its folder yet. Drop the V5, MOT certificates, insurance and finance papers in there.</p>}
            <details className="mt-4">
              <summary className="cursor-pointer text-[15px] font-medium underline underline-offset-4">Change details</summary>
              <div className="mt-4">
                <VehicleForm vehicle={v} people={staff} />
              </div>
            </details>
          </Card>
        );
      })}
      <Card title="Add a vehicle">
        <VehicleForm vehicle={null} people={staff} />
      </Card>
    </div>
  );
}
