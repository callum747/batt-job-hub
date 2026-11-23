import "server-only";
/**
 * Drive → app: a job folder made by hand in Live, Active, Completed or Lost becomes a job in the app.
 * (App → Drive is syncJobFolder: a numbered job gets its folder.) The folder is never renamed, moved or changed.
 * Test mode looks only in the test folders.
 */
import { sql } from "../db";
import { audit } from "../mutations";
import { folderAreaFor, todayUK, ukDate, type Stage } from "../jobs-rules";
import { googleConnected, googleSettings, type GoogleArea } from "./client";
import { listChildren } from "./drive";
import { parseJobFolderName, STAGE_FOR_AREA } from "./format";

export const DRIVE_SCAN_MINUTES = 10;

export type DriveImport = { ran: boolean; created: string[]; linked: string[]; updated: string[]; clashes: string[]; message: string };

/** Runs at most every 10 minutes unless forced (it's forced just before the app gives out a new job number). */
export async function importDriveFolders(email: string, opts: { force?: boolean } = {}): Promise<DriveImport> {
  const out: DriveImport = { ran: false, created: [], linked: [], updated: [], clashes: [], message: "" };
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
  // Job folders sit in the four stage folders, or one level down in a folder like "2026" (Completed is split by year).
  const found: { id: string; name: string; url: string; area: GoogleArea }[] = [];
  for (const area of Object.keys(areas) as GoogleArea[]) {
    const top = await listChildren(email, [areas[area]], true);
    const groups = top.filter((f) => !parseJobFolderName(f.name));
    const nested = groups.length ? await listChildren(email, groups.map((f) => f.id), true) : [];
    for (const f of [...top, ...nested]) found.push({ id: f.id, name: f.name, url: f.webViewLink ?? `https://drive.google.com/drive/folders/${f.id}`, area });
  }
  type Linked = { id: string; folder: string; folder_name: string; folder_area: string; stage: Stage; site: string; client: string | null; client_id: string | null; number: number | null };
  const linked = new Map(
    (await sql<Linked[]>`
      select j.id, j.drive_folder_id as folder, j.drive_folder_name as folder_name, j.drive_folder_area as folder_area, j.stage, j.site, c.name as client, j.client_id, j.number
      from jobs j left join clients c on c.id = j.client_id where j.drive_folder_id <> '' and j.merged_into is null`).map((r) => [r.folder, r]),
  );

  for (const f of found) {
    const job = linked.get(f.id);
    if (job) {
      await followChanges(email, job, f, out);
      continue;
    }
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
        await tx`update jobs set drive_folder_id = ${f.id}, drive_folder_url = ${f.url}, drive_folder_name = ${f.name}, drive_folder_area = ${f.area}, drive_error = '', updated_at = now() where id = ${job.id}`;
        await audit(tx, email, "Drive folder linked", "job", job.id, { folder: f.name });
        out.linked.push(f.name);
        return;
      }
      const clientId = await clientFor(tx, parsed.client);
      const note = `${ukDate(todayUK())}: made from the Drive folder "${f.name}" (in ${f.area}).`;
      const [created] = await tx<{ id: string }[]>`
        insert into jobs (number, client_id, site, stage, received, drive_folder_id, drive_folder_url, drive_folder_name, drive_folder_area, notes)
        values (${parsed.number}, ${clientId}, ${parsed.site}, ${STAGE_FOR_AREA[f.area]}, ${todayUK()}, ${f.id}, ${f.url}, ${f.name}, ${f.area}, ${note})
        returning id`;
      await audit(tx, email, "created from Drive folder", "job", created.id, { folder: f.name, area: f.area });
      out.created.push(f.name);
    });
  }
  out.message = [
    out.created.length ? `${out.created.length} new job${out.created.length === 1 ? "" : "s"} from Drive folders` : "",
    out.linked.length ? `${out.linked.length} folder${out.linked.length === 1 ? "" : "s"} linked to existing jobs` : "",
    out.updated.length ? `${out.updated.length} job${out.updated.length === 1 ? "" : "s"} updated from Drive: ${out.updated.join("; ")}` : "",
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

async function clientFor(tx: Tx, name: string): Promise<string | null> {
  if (!name) return null;
  const [c] = await tx<{ id: string }[]>`select id from clients where lower(name) = lower(${name}) limit 1`;
  return c?.id ?? (await tx<{ id: string }[]>`insert into clients (name) values (${name}) returning id`)[0].id;
}

/**
 * A linked folder that was moved or renamed by hand: the job follows. Moved to another stage folder sets the
 * stage (Live = Draft quote, Active = Booked, Completed = Paid, Lost = Lost) unless the job's stage already
 * belongs there. Renamed changes the client and site, but only when the client or site part of the name changed
 * (so "Q-552 – …" becoming "#552 – …" changes nothing).
 */
async function followChanges(
  email: string,
  job: { id: string; folder_name: string; folder_area: string; stage: Stage; site: string; client: string | null; client_id: string | null; number: number | null },
  f: { id: string; name: string; area: GoogleArea },
  out: DriveImport,
) {
  const changes: string[] = [];
  const label = job.number ? `#${job.number}` : "a job";
  // Only a move since the folder was last seen counts, so the first look never changes anything.
  if (job.folder_area && job.folder_area !== f.area) {
    if (folderAreaFor(job.stage) !== f.area) {
      const stage = STAGE_FOR_AREA[f.area];
      await sql`update jobs set stage = ${stage}, updated_at = now() where id = ${job.id}`;
      await audit(sql, email, "stage (folder moved in Drive)", "job", job.id, { from: job.stage, to: stage, folder: f.name });
      changes.push(`${label} moved to ${stage}`);
    }
  }
  if (job.folder_area !== f.area) await sql`update jobs set drive_folder_area = ${f.area} where id = ${job.id}`;
  if (f.name !== job.folder_name) {
    const before = job.folder_name ? parseJobFolderName(job.folder_name) : null;
    const now = parseJobFolderName(f.name);
    if (before && now && (before.client !== now.client || before.site !== now.site)) {
      const clientId = now.client && now.client !== before.client ? await clientFor(sql, now.client) : job.client_id;
      const site = now.site !== before.site ? now.site : job.site;
      await sql`update jobs set client_id = ${clientId}, site = ${site}, updated_at = now() where id = ${job.id}`;
      await audit(sql, email, "renamed in Drive", "job", job.id, { from: job.folder_name, to: f.name });
      changes.push(`${label} renamed to "${f.name}"`);
    }
    await sql`update jobs set drive_folder_name = ${f.name} where id = ${job.id}`;
  }
  if (changes.length) out.updated.push(...changes);
}
