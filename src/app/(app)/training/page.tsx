import Link from "next/link";
import { Check, ChevronRight, GraduationCap } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";
import { Card } from "@/components/ui";
import { getPeople } from "@/lib/data";
import { todayUK, ukDate } from "@/lib/jobs-rules";
import { buildMatrix, qualState } from "@/lib/training";
import { listQualifications } from "@/lib/training-run";
import { QualificationForm } from "./forms";

export const metadata = { title: "Training" };

const cell = { held: "bg-good/10", soon: "bg-warn/15", expired: "bg-bad/10 text-bad", none: "" } as const;

export default async function TrainingPage() {
  const [people, quals] = await Promise.all([getPeople(), listQualifications(true)]);
  const today = todayUK();
  const staff = people.map((p) => ({ id: p.id, short_name: p.short_name }));
  const m = buildMatrix(staff, quals, today);
  const names = [...new Set(quals.map((q) => q.name))].sort();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Training" intro="Who holds which qualifications and cards, and what's running out." />
      {m.columns.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Nothing on the matrix yet" text="Add each person's qualifications and cards below. Anything running out within 60 days shows on Today." />
      ) : (
        <Card title="Training matrix">
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-[14px]">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-bg px-3 py-2 text-left font-semibold">Person</th>
                  {m.columns.map((c) => (
                    <th key={c} className="px-3 py-2 text-left align-bottom font-semibold">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.rows.map((r) => (
                  <tr key={r.personId}>
                    <th className="sticky left-0 border-t border-line bg-bg px-3 py-2.5 text-left font-semibold">
                      <Link href={`/training/${r.personId}`} className="underline underline-offset-4 hover:text-blue-deep">{r.person}</Link>
                    </th>
                    {r.cells.map((c, i) => (
                      <td key={i} className={`border-t border-line px-3 py-2.5 align-top ${cell[c.state]}`}>
                        {c.q ? (
                          <>
                            <span className="flex items-center gap-1 font-medium">
                              {c.state === "held" && <Check className="h-4 w-4 text-good" aria-hidden="true" />}
                              {c.state === "held" ? "Held" : c.state === "soon" ? "Running out" : "Expired"}
                            </span>
                            <span className="block text-[13px] opacity-80">{c.q.expires ? ukDate(c.q.expires) : "No expiry"}</span>
                          </>
                        ) : (
                          <span className="text-muted">–</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[13px] text-muted">Green is held, amber runs out within 60 days, red has expired.</p>
        </Card>
      )}

      <Card title="People">
        <p className="mb-2 text-[14px] text-muted">Open someone to see their cards and qualifications, change them, or add a certificate.</p>
        <ul className="divide-y divide-line">
          {staff.map((p) => {
            const mine = quals.filter((q) => q.person_id === p.id && q.active);
            const flagged = mine.filter((q) => qualState(q, today) !== "held").length;
            return (
              <li key={p.id}>
                <Link href={`/training/${p.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 text-[15px] hover:bg-surface">
                  <span className="min-w-0 flex-1 font-semibold">{p.short_name}</span>
                  <span className="text-[14px] text-muted">{mine.length} held{flagged ? ` · ${flagged} need${flagged === 1 ? "s" : ""} attention` : ""}</span>
                  <ChevronRight className="h-4 w-4 text-muted" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Add a qualification or card">
        <QualificationForm qual={null} people={staff} names={names} />
      </Card>
    </div>
  );
}
