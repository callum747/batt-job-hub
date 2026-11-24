import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText, FolderOpen } from "lucide-react";
import { PageHeader } from "@/components/page";
import { Card, secondaryBtn } from "@/components/ui";
import { currentPerson } from "@/lib/auth";
import { getPeople } from "@/lib/data";
import { googleConnected } from "@/lib/google/client";
import type { DriveFile } from "@/lib/google/drive";
import { gbp } from "@/lib/money";
import { todayUK, ukDate } from "@/lib/jobs-rules";
import { dueItems, dueText, lastOfEach } from "@/lib/vehicles";
import { getVehicle, vehicleEvents, vehicleFiles } from "@/lib/vehicles-run";
import { VehicleDocForm, VehicleFolderButton, VehicleForm, VehicleLogForm } from "../forms";

const tone = { overdue: "bg-bad/10 text-bad border-bad/30", soon: "bg-warn/10 border-warn/40", ok: "bg-surface border-line" } as const;

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await getVehicle(id);
  if (!v) notFound();
  const [events, people, me] = await Promise.all([vehicleEvents(v.id), getPeople(), currentPerson()]);
  const connected = me && me.email !== "preview@localhost" ? await googleConnected(me.email) : false;
  let files: DriveFile[] | null = null;
  if (connected && v.drive_folder_id) {
    try {
      files = await vehicleFiles(me!.email, v.drive_folder_id);
    } catch {
      files = null;
    }
  }
  const today = todayUK();
  const due = dueItems(v, today);
  const last = lastOfEach(events);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/vehicles" className="inline-flex items-center gap-1 text-[15px] text-muted hover:text-text">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> All vehicles
      </Link>
      <PageHeader
        title={v.name}
        intro={[v.registration, v.make_model, v.driver ? `driven by ${v.driver}` : "", v.active ? "" : "no longer ours"].filter(Boolean).join(" · ") || "No details yet"}
        action={
          v.drive_folder_url ? (
            <a href={v.drive_folder_url} target="_blank" rel="noreferrer" className={secondaryBtn}>
              <FolderOpen className="h-5 w-5 text-blue" aria-hidden="true" /> Its folder in Drive
            </a>
          ) : connected ? (
            <VehicleFolderButton id={v.id} />
          ) : undefined
        }
      />

      <Card title="What's due">
        {due.length === 0 ? (
          <p className="text-muted">No dates set yet. Add them under Details, or log the last MOT, service or insurance below with its next date.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {due.map((d) => (
              <li key={d.what} className={`rounded-lg border px-3 py-2 text-[14px] ${tone[d.state]}`}>
                <span className="font-semibold">{d.state === "ok" ? d.what : dueText(d)}</span>
                <span className="block text-[13px] opacity-80">{ukDate(d.on)}</span>
              </li>
            ))}
          </ul>
        )}
        {last.length > 0 && (
          <dl className="mt-4 grid gap-2 text-[15px] sm:grid-cols-2 lg:grid-cols-3">
            {last.map((e) => (
              <div key={e.id} className="rounded-xl bg-surface px-4 py-3">
                <dt className="text-[13px] text-muted">Last {e.kind.toLowerCase()}</dt>
                <dd className="font-medium">{ukDate(e.date)}{e.mileage ? ` · ${e.mileage.toLocaleString("en-GB")} miles` : ""}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <Card title="Log">
        <VehicleLogForm vehicleId={v.id} today={today} />
        {events.length > 0 && (
          <ul className="mt-6 divide-y divide-line rounded-xl border border-line bg-bg">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3 text-[15px]">
                <span className="w-24 shrink-0 font-semibold">{e.kind}</span>
                <span className="min-w-0 flex-1">
                  <span className="block">{ukDate(e.date)}{e.mileage ? ` · ${e.mileage.toLocaleString("en-GB")} miles` : ""}{e.cost !== null ? ` · ${gbp(e.cost)}` : ""}</span>
                  {e.notes && <span className="block text-[14px] text-muted">{e.notes}</span>}
                </span>
                {e.file_url && (
                  <a href={e.file_url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[14px] font-medium underline underline-offset-4">
                    <FileText className="h-4 w-4" aria-hidden="true" /> Paperwork
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Documents">
        <p className="mb-3 text-[15px] text-muted">Everything in this van&apos;s Drive folder: the V5, insurance, finance agreement and whatever was saved from the log.</p>
        {files && files.length > 0 && (
          <ul className="mb-4 divide-y divide-line rounded-xl border border-line bg-bg">
            {files.map((f) => (
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
        {files && files.length === 0 && <p className="mb-4 text-[14px] text-muted">Nothing in its folder yet.</p>}
        {connected ? <VehicleDocForm vehicleId={v.id} /> : <p className="text-[14px] text-muted">Connect Google in Settings to save documents.</p>}
      </Card>

      <Card title="Details">
        <VehicleForm vehicle={v} people={people.map((p) => ({ id: p.id, short_name: p.short_name }))} />
      </Card>
    </div>
  );
}
