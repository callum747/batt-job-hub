import "server-only";
/**
 * Drive → app: a job folder made by hand in Live, Active, Completed or Lost becomes a job in the app.
 * (App → Drive is syncJobFolder: a numbered job gets its folder.) The folder is never renamed, moved or changed.
 * Test mode looks only in the test folders.
 */
import { sql } from "../db";
import { audit } from "../mutations";
import { todayUK, ukDate } from "../jobs-rules";
import { googleConnected, googleSettings, type GoogleArea } from "./client";
import { listChildren } from "./drive";
import { parseJobFolderName, STAGE_FOR_AREA } from "./format";

export const DRIVE_SCAN_MINUTES = 10;

export type DriveImport = { ran: boolean; created: string[]; linked: string[]; clashes: string[]; message: string };

/** Runs at most every 10 minutes unless forced (it's forced just before the app gives out a new job number). */
export async function importDriveFolders(email: string, opts: { force?: boolean } = {}): Promise<DriveImport> {
  const out: DriveImport = { ran: false, created: [], linked: [], clashes: [], message: "" };
  if (!(await googleConnected(email))) return { ...out, message: "Google isn't connected." };
  const claimed = await sql`
    insert into settings (key, value) values ('driveImport', jsonb_build_object('lastScan', now()))
    on conflict (key) do update set value = jsonb_build_object('lastScan', now()), updated_at = now()
    where ${opts.force ?? false} or (settings.value->>'lastScan')::timestamptz < now() - ${`${DRIVE_SCAN_MINUTES} minutes`}::interval
    returning key`;
  if (claimed.length === 0) return { ...out, message: "Checked recently." };
  out.ran = true;

  const g = await googleSettings();
  const areas = g[g.mode].folders;
  const found: { id: string; name: string; url: string; area: GoogleArea }[] = [];
  for (const area of Object.keys(areas) as GoogleArea[]) {
    for (const f of await listChildren(email, [areas[area]], true)) found.push({ id: f.id, name: f.name, url: f.webViewLink ?? `https://drive.google.com/drive/folders/${f.id}`, area });
  }
  const linkedIds = new Set((await sql<{ id: string }[]>`select drive_folder_id as id from jobs where drive_folder_id <> ''`).map((r) => r.id));

  for (const f of found) {
    if (linkedIds.has(f.id)) continue;
    const parsed = parseJobFolderName(f.name);
    if (!parsed) continue;
    await sql.begin(async (tx) => {
      // The same lock as job numbering, so a new number can't be given out while this one is being taken.
      await tx`select pg_advisory_xact_lock(557000)`;
      const [job] = await tx<{ id: string; number: number | null; drive_folder_id: string }[]>`
        select id, number, drive_folder_id from jobs where merged_into is null and (number = ${parsed.number} or ${parsed.number} = any(also)) limit 1`;
      if (job) {
        if (job.drive_folder_id) {
          out.clashes.push(`${f.name} (job #${parsed.number} already has a different folder)`);
          return;
        }
        await tx`update jobs set drive_folder_id = ${f.id}, drive_folder_url = ${f.url}, drive_error = '', updated_at = now() where id = ${job.id}`;
        await audit(tx, email, "Drive folder linked", "job", job.id, { folder: f.name });
        out.linked.push(f.name);
        return;
      }
      let clientId: string | null = null;
      if (parsed.client) {
        const [c] = await tx<{ id: string }[]>`select id from clients where lower(name) = lower(${parsed.client}) limit 1`;
        clientId = c?.id ?? (await tx<{ id: string }[]>`insert into clients (name) values (${parsed.client}) returning id`)[0].id;
      }
      const note = `${ukDate(todayUK())}: made from the Drive folder "${f.name}" (in ${f.area}).`;
      const [created] = await tx<{ id: string }[]>`
        insert into jobs (number, client_id, site, stage, received, drive_folder_id, drive_folder_url, notes)
        values (${parsed.number}, ${clientId}, ${parsed.site}, ${STAGE_FOR_AREA[f.area]}, ${todayUK()}, ${f.id}, ${f.url}, ${note})
        returning id`;
      await audit(tx, email, "created from Drive folder", "job", created.id, { folder: f.name, area: f.area });
      out.created.push(f.name);
    });
  }
  out.message = [
    out.created.length ? `${out.created.length} new job${out.created.length === 1 ? "" : "s"} from Drive folders` : "",
    out.linked.length ? `${out.linked.length} folder${out.linked.length === 1 ? "" : "s"} linked to existing jobs` : "",
    out.clashes.length ? `${out.clashes.length} folder${out.clashes.length === 1 ? "" : "s"} with a job number that's already taken: ${out.clashes.join("; ")}` : "",
  ].filter(Boolean).join(". ") || "No new job folders in Drive.";
  return out;
}

/** Called just before a job is given a number: picks up any folder made by hand so its number isn't reused. Never throws. */
export async function checkDriveBeforeNumbering(email: string) {
  try {
    await importDriveFolders(email, { force: true });
  } catch {
    // Drive being unreachable mustn't stop someone pricing a job.
  }
}
