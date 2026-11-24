import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText, FolderOpen } from "lucide-react";
import { PageHeader } from "@/components/page";
import { Card, secondaryBtn } from "@/components/ui";
import { currentPerson } from "@/lib/auth";
import { getPeople } from "@/lib/data";
import { sql } from "@/lib/db";
import { googleConnected } from "@/lib/google/client";
import { todayUK, ukDate } from "@/lib/jobs-rules";
import { daysUntil, qualState } from "@/lib/training";
import { listQualifications } from "@/lib/training-run";
import { CertificateForm, QualificationForm } from "../forms";

const tone = { held: "border-line bg-bg", soon: "border-warn/40 bg-warn/10", expired: "border-bad/30 bg-bad/10" } as const;

function when(expires: string | null, today: string) {
  if (!expires) return "Doesn't run out";
  const d = daysUntil(today, expires);
  if (d < 0) return `Ran out ${ukDate(expires)} (${-d} day${d === -1 ? "" : "s"} ago)`;
  if (d === 0) return "Runs out today";
  return `Runs out ${ukDate(expires)} (in ${d} day${d === 1 ? "" : "s"})`;
}

export default async function PersonTrainingPage({ params }: { params: Promise<{ person: string }> }) {
  const { person } = await params;
  const people = await getPeople(true);
  const p = people.find((x) => x.id === person);
  if (!p) notFound();
  const [all, me, [folder]] = await Promise.all([
    listQualifications(true),
    currentPerson(),
    sql<{ training_folder_url: string }[]>`select training_folder_url from people where id = ${p.id}`,
  ]);
  const connected = me && me.email !== "preview@localhost" ? await googleConnected(me.email) : false;
  const today = todayUK();
  const mine = all.filter((q) => q.person_id === p.id);
  const held = mine.filter((q) => q.active);
  const gone = mine.filter((q) => !q.active);
  const staff = people.filter((x) => x.active).map((x) => ({ id: x.id, short_name: x.short_name }));
  const names = [...new Set(all.map((q) => q.name))].sort();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/training" className="inline-flex items-center gap-1 text-[15px] text-muted hover:text-text">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Training matrix
      </Link>
      <PageHeader
        title={p.full_name || p.short_name}
        intro={`${p.role || "Team"} · ${held.length} qualification${held.length === 1 ? "" : "s"} and card${held.length === 1 ? "" : "s"}`}
        action={
          folder?.training_folder_url ? (
            <a href={folder.training_folder_url} target="_blank" rel="noreferrer" className={secondaryBtn}>
              <FolderOpen className="h-5 w-5 text-blue" aria-hidden="true" /> Their folder in Drive
            </a>
          ) : undefined
        }
      />

      {held.length === 0 && <p className="rounded-2xl border border-line bg-bg p-5 text-muted">Nothing recorded for {p.short_name} yet. Add their cards and qualifications below.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {held.map((q) => {
          const state = qualState(q, today);
          return (
            <li key={q.id} className={`rounded-2xl border p-5 shadow-card ${tone[state]}`}>
              <p className="text-[17px] font-semibold">{q.name}</p>
              {q.number && <p className="text-[15px] tabular-nums text-muted">No. {q.number}</p>}
              <p className={`mt-2 text-[15px] ${state === "expired" ? "font-semibold text-bad" : state === "soon" ? "font-semibold" : ""}`}>{when(q.expires, today)}</p>
              {q.issued && <p className="text-[14px] text-muted">Gained {ukDate(q.issued)}</p>}
              {q.notes && <p className="mt-1 text-[14px] text-muted">{q.notes}</p>}
              {q.file_url && (
                <a href={q.file_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[15px] font-medium underline underline-offset-4">
                  <FileText className="h-4 w-4" aria-hidden="true" /> See the card or certificate
                </a>
              )}
              <details className="mt-3">
                <summary className="cursor-pointer text-[14px] font-medium underline underline-offset-4">Change, or add the certificate</summary>
                <div className="mt-4 space-y-5">
                  {connected ? <CertificateForm qualId={q.id} has={Boolean(q.file_url)} /> : <p className="text-[14px] text-muted">Connect Google in Settings to save certificates.</p>}
                  <QualificationForm qual={q} people={staff} names={names} />
                </div>
              </details>
            </li>
          );
        })}
      </ul>

      <Card title={`Add a qualification or card for ${p.short_name}`}>
        <QualificationForm qual={null} people={[{ id: p.id, short_name: p.short_name }]} names={names} />
      </Card>

      {gone.length > 0 && (
        <Card title="No longer held">
          <ul className="divide-y divide-line">
            {gone.map((q) => (
              <li key={q.id} className="py-2.5">
                <details>
                  <summary className="cursor-pointer text-[15px] text-muted">{q.name}{q.expires ? ` · ran to ${ukDate(q.expires)}` : ""}</summary>
                  <div className="mt-4"><QualificationForm qual={q} people={staff} names={names} /></div>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
