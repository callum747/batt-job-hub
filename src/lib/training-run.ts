import "server-only";
/** Qualifications with their data. */
import { sql } from "./db";
import { audit } from "./mutations";
import { todayUK } from "./jobs-rules";
import { qualState, type Qualification } from "./training";

export async function listQualifications(includeInactive = false): Promise<Qualification[]> {
  const rows = await sql<Qualification[]>`
    select q.id, q.person_id, p.short_name as person, q.name, q.number, q.issued, q.expires, q.file_url, q.notes, q.active
    from qualifications q join people p on p.id = q.person_id order by p.position, q.name, q.expires nulls last`;
  return rows.map((r) => ({ ...r })).filter((q) => includeInactive || q.active);
}

export type QualInput = Partial<Pick<Qualification, "person_id" | "name" | "number" | "issued" | "expires" | "file_url" | "notes" | "active">>;

export async function saveQualification(id: string | null, f: QualInput, actor: string): Promise<string> {
  const set = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) as Record<string, string | boolean | null>;
  if (typeof set.name === "string") set.name = set.name.replace(/\s+/g, " ").trim();
  if (id) {
    if (Object.keys(set).length) await sql`update qualifications set ${sql(set)}, updated_at = now() where id = ${id}`;
    await audit(sql, actor, "qualification edited", "qualification", id, { changed: Object.keys(set) });
    return id;
  }
  if (!set.person_id) throw new Error("Say whose qualification it is.");
  if (!String(set.name ?? "").trim()) throw new Error("Say what the qualification or card is.");
  const [row] = await sql<{ id: string }[]>`insert into qualifications ${sql(set)} returning id`;
  await audit(sql, actor, "qualification added", "qualification", row.id, { name: set.name });
  return row.id;
}

/** Cards and qualifications that have run out or run out within 60 days, soonest first. */
export async function trainingDue(today = todayUK()) {
  return (await listQualifications())
    .filter((q) => q.expires && qualState(q, today) !== "held")
    .sort((a, b) => (a.expires ?? "").localeCompare(b.expires ?? ""));
}
