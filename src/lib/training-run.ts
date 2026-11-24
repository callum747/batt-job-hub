import "server-only";
/** Qualifications with their data. */
import { sql } from "./db";
import { audit } from "./mutations";
import { todayUK } from "./jobs-rules";
import { qualState, type Qualification } from "./training";
import { createFolder, listChildren } from "./google/drive";
import { uploadFile } from "./google/workspace";

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

/** The person's own folder inside 08 - Staff & Employees › 02 - Qualifications & Cards, made the first time it's needed. */
export async function personTrainingFolder(personId: string, email: string): Promise<{ id: string; url: string }> {
  const [p] = await sql<{ full_name: string; short_name: string; training_folder_id: string; training_folder_url: string }[]>`
    select full_name, short_name, training_folder_id, training_folder_url from people where id = ${personId}`;
  if (!p) throw new Error("That person isn't on the People list.");
  if (p.training_folder_id) return { id: p.training_folder_id, url: p.training_folder_url };
  const [row] = await sql<{ value: { folderId?: string } }[]>`select value from settings where key = 'training'`;
  const parent = row?.value?.folderId;
  if (!parent) throw new Error("The Qualifications & Cards folder isn't set.");
  const name = (p.full_name || p.short_name).replace(/[\\/]+/g, "-").trim();
  const there = (await listChildren(email, [parent], true)).find((f) => f.name.toLowerCase() === name.toLowerCase());
  const folder = there ?? (await createFolder(email, name, parent));
  const url = folder.webViewLink ?? `https://drive.google.com/drive/folders/${folder.id}`;
  await sql`update people set training_folder_id = ${folder.id}, training_folder_url = ${url} where id = ${personId}`;
  await audit(sql, email, there ? "training folder linked" : "training folder made", "person", personId, { folder: name });
  return { id: folder.id, url };
}

/** Saves a card photo or certificate into the person's folder and links it to the qualification. */
export async function saveCertificate(qualId: string, file: { name: string; type: string; data: Uint8Array }, email: string): Promise<string> {
  const [q] = await sql<{ person_id: string; name: string }[]>`select person_id, name from qualifications where id = ${qualId}`;
  if (!q) throw new Error("That qualification doesn't exist.");
  if (file.data.length === 0) throw new Error("Choose a file first.");
  const folder = await personTrainingFolder(q.person_id, email);
  const ext = file.name.match(/\.[A-Za-z0-9]{2,5}$/)?.[0] ?? "";
  const saved = await uploadFile(email, `${q.name.replace(/[\\/]+/g, "-")}${ext}`, file.type || "application/octet-stream", folder.id, file.data);
  await sql`update qualifications set file_url = ${saved.url}, updated_at = now() where id = ${qualId}`;
  await audit(sql, email, "certificate saved", "qualification", qualId, { name: q.name });
  return saved.url;
}

/** Cards and qualifications that have run out or run out within 60 days, soonest first. */
export async function trainingDue(today = todayUK()) {
  return (await listQualifications())
    .filter((q) => q.expires && qualState(q, today) !== "held")
    .sort((a, b) => (a.expires ?? "").localeCompare(b.expires ?? ""));
}
