import "server-only";
/**
 * Moving, renaming and binning things in Batt's shared Drive for the assistant. Rules that can't be talked round:
 *  - only inside Batt's shared drive (in test mode, only inside the test folders);
 *  - never the top-level folders, the four stage folders, the templates or the ledger;
 *  - binning puts the item in Drive's bin (Google keeps it 30 days), and only after the person has said yes in a
 *    message of their own after being told exactly what will go;
 *  - every change is written to the audit log.
 */
import { sql } from "../db";
import { audit } from "../mutations";
import { google, googleSettings, GoogleError } from "./client";
import { listAllJobFiles } from "./job-files";

const FOLDER = "application/vnd.google-apps.folder";
export type Item = { id: string; name: string; mimeType: string; parents?: string[]; webViewLink?: string; trashed?: boolean; driveId?: string };
const FIELDS = "id,name,mimeType,parents,webViewLink,trashed,driveId";
const ALL = { supportsAllDrives: true } as const;

export const get = (email: string, id: string) => google<Item>(email, `/drive/v3/files/${encodeURIComponent(id)}`, { query: { ...ALL, fields: FIELDS } });

/** The folders above an item, nearest first, stopping at the top of the drive. */
export async function chain(email: string, item: Item): Promise<Item[]> {
  const out: Item[] = [];
  let at = item;
  for (let i = 0; i < 12 && at.parents?.[0] && at.parents[0] !== at.driveId; i++) {
    at = await get(email, at.parents[0]);
    out.push(at);
  }
  return out;
}

export type Ground = { mode: "test" | "live"; driveId: string; areas: Record<string, string>; fixed: Set<string>; testRoots: string[] };

export async function ground(email: string): Promise<Ground> {
  const g = await googleSettings();
  const areas = g[g.mode].folders as Record<string, string>;
  const live = await get(email, g.live.folders.Live);
  if (!live.driveId) throw new GoogleError("Batt's job folders aren't in a shared drive, so the assistant won't change anything there.");
  const [t] = await sql<{ value: Record<string, string> }[]>`select value from settings where key = 'templates'`;
  const [f] = await sql<{ value: { ledgerId?: string; testLedgerId?: string } }[]>`select value from settings where key = 'finance'`;
  const fixed = new Set<string>([...Object.values(g.live.folders), ...Object.values(g.test.folders), ...Object.values(t?.value ?? {}), f?.value?.ledgerId ?? "", f?.value?.testLedgerId ?? ""].filter(Boolean));
  return { mode: g.mode, driveId: live.driveId, areas, fixed, testRoots: Object.values(g.test.folders) };
}

/** Checks an item may be changed, and says where it is. Throws a plain reason if not. */
export async function allowed(email: string, id: string, gr: Ground, what: string) {
  const item = await get(email, id);
  if (item.trashed) throw new Error(`"${item.name}" is already in the bin.`);
  if (item.driveId !== gr.driveId) throw new Error(`"${item.name}" isn't in Batt's shared drive, so it can't be ${what} from here.`);
  if (gr.fixed.has(item.id)) throw new Error(`"${item.name}" is one of the folders or templates the app depends on, so it can't be ${what}.`);
  if (!item.parents?.[0] || item.parents[0] === gr.driveId) throw new Error(`"${item.name}" is a top-level folder of the drive, so it can't be ${what} from here.`);
  const above = await chain(email, item);
  if (gr.mode === "test" && !above.some((a) => gr.testRoots.includes(a.id))) throw new Error(`The app is in test mode, so only things inside the test folders can be ${what}. "${item.name}" is a real one.`);
  return { item, path: above.map((a) => a.name).reverse().join(" › ") };
}

export type Found = { id: string; name: string; kind: "folder" | "file"; where: string; link: string | null };

/** Folders and files in Batt's shared drive whose name contains the words given. */
export async function driveFind(email: string, words: string): Promise<Found[]> {
  const gr = await ground(email);
  const q = words.trim().split(/\s+/).filter(Boolean).map((w) => `name contains '${w.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`).join(" and ");
  if (!q) return [];
  const page = await google<{ files: Item[] }>(email, "/drive/v3/files", {
    query: { ...ALL, includeItemsFromAllDrives: true, corpora: "drive", driveId: gr.driveId, pageSize: 25, fields: `files(${FIELDS})`, q: `${q} and trashed = false` },
  });
  const out: Found[] = [];
  for (const f of page.files ?? []) {
    const above = await chain(email, f);
    if (gr.mode === "test" && !above.some((a) => gr.testRoots.includes(a.id))) continue;
    out.push({ id: f.id, name: f.name, kind: f.mimeType === FOLDER ? "folder" : "file", where: above.map((a) => a.name).reverse().join(" › ") || "(top of the drive)", link: f.webViewLink ?? null });
  }
  return out;
}

export async function driveMove(me: { email: string }, id: string, to: { folderId?: string; area?: string }) {
  const gr = await ground(me.email);
  const { item, path } = await allowed(me.email, id, gr, "moved");
  const targetId = to.folderId ?? (to.area ? gr.areas[to.area] : undefined);
  if (!targetId) throw new Error("Say where it should go: a folder id, or one of Live, Lost, Active, Completed.");
  const target = await get(me.email, targetId);
  if (target.mimeType !== FOLDER) throw new Error(`"${target.name}" isn't a folder.`);
  if (target.driveId !== gr.driveId) throw new Error(`"${target.name}" isn't in Batt's shared drive.`);
  const targetChain = await chain(me.email, target);
  if (gr.mode === "test" && !gr.testRoots.includes(target.id) && !targetChain.some((a) => gr.testRoots.includes(a.id))) throw new Error("The app is in test mode, so things can only be moved into the test folders.");
  if (target.id === item.id || targetChain.some((a) => a.id === item.id)) throw new Error("A folder can't be moved inside itself.");
  if (item.parents![0] === target.id) return { moved: false, note: `"${item.name}" is already in ${target.name}.` };
  await google(me.email, `/drive/v3/files/${encodeURIComponent(item.id)}`, { method: "PATCH", query: { ...ALL, addParents: target.id, removeParents: item.parents![0], fields: "id" }, body: {} });
  const toPath = [...targetChain.map((a) => a.name).reverse(), target.name].join(" › ");
  await audit(sql, me.email, "Drive: moved (assistant)", "drive", item.id, { name: item.name, from: path, to: toPath });
  return { moved: true, name: item.name, from: path, to: toPath, link: item.webViewLink ?? null };
}

export async function driveRename(me: { email: string }, id: string, name: string) {
  const gr = await ground(me.email);
  const { item, path } = await allowed(me.email, id, gr, "renamed");
  const next = name.trim();
  if (!next) throw new Error("Give the new name.");
  if (next === item.name) return { renamed: false, note: "It already has that name." };
  await google(me.email, `/drive/v3/files/${encodeURIComponent(item.id)}`, { method: "PATCH", query: { ...ALL, fields: "id" }, body: { name: next } });
  await audit(sql, me.email, "Drive: renamed (assistant)", "drive", item.id, { from: item.name, to: next, in: path });
  return { renamed: true, from: item.name, to: next, in: path };
}

const YES = /\b(yes|yeah|yep|yup|go ahead|do it|confirm|confirmed|bin it|bin them|delete it|delete them|trash it)\b/i;
const NO = /\b(no|nope|don'?t|stop|wait|hold on|cancel)\b/i;
/** True when the person's own message is a clear yes. */
export const saidYes = (text: string) => YES.test(text) && !NO.test(text);

/**
 * Puts a file or folder in Drive's bin. The first call only describes what would go and waits. It happens on a
 * later call, and only if the person's own message since then is a clear yes.
 */
export async function driveBin(me: { email: string }, id: string, turn: { userText: string; startedAt: Date }) {
  const gr = await ground(me.email);
  const { item, path } = await allowed(me.email, id, gr, "binned");
  const linked = await sql<{ number: number | null }[]>`select number from jobs where drive_folder_id = ${item.id} and merged_into is null`;
  if (linked.length) throw new Error(`"${item.name}" is the Drive folder of job ${linked[0].number ? `#${linked[0].number}` : "(no number yet)"}. A live job's folder can't be binned from here; mark the job Lost or Closed instead, or bin the folder by hand in Drive.`);
  const inside = item.mimeType === FOLDER ? await listAllJobFiles(me.email, item.id) : null;
  const what = { name: item.name, kind: item.mimeType === FOLDER ? "folder" : "file", in: path, ...(inside ? { files_inside: inside.files.length + (inside.more ? "+" : ""), some: inside.files.slice(0, 8).map((f) => f.name) } : {}) };

  const [asked] = await sql<{ id: string }[]>`
    select id from assistant_pending where email = ${me.email} and action = 'bin' and item_id = ${item.id} and done_at is null
      and created_at < ${turn.startedAt} and created_at > now() - interval '30 minutes' order by created_at desc limit 1`;
  if (!asked || !saidYes(turn.userText)) {
    if (!asked) await sql`insert into assistant_pending (email, action, item_id, detail) values (${me.email}, 'bin', ${item.id}, ${sql.json(what as never)})`;
    return { binned: false, waiting_for_yes: true, would_bin: what, tell_the_user: "Nothing has been binned. Tell the user exactly what would go (name, where it is, how many files are inside) and ask them to reply yes. Only call this again after they have." };
  }
  await google(me.email, `/drive/v3/files/${encodeURIComponent(item.id)}`, { method: "PATCH", query: { ...ALL, fields: "id" }, body: { trashed: true } });
  await sql`update assistant_pending set done_at = now() where id = ${asked.id}`;
  await audit(sql, me.email, "Drive: binned (assistant)", "drive", item.id, what);
  return { binned: true, ...what, note: "It's in Drive's bin. Google keeps it for 30 days, so it can be restored from the bin until then." };
}
