import "server-only";
/**
 * One-off tidy-up Callum asked for (23/11/2026): every "Q-552" in a Drive file or folder name becomes "#552",
 * and job folders named with a plain number ("558 – …") get their #. Names only: nothing inside a file is
 * changed and nothing is moved. Safe to run again: it only touches what still needs changing.
 */
import { sql } from "../db";
import { audit } from "../mutations";
import { google, googleSettings } from "./client";
import { listChildren } from "./drive";
import { hashedName, hashedPlainNumber, parseJobFolderName } from "./format";

type F = { id: string; name: string };

async function searchQ(email: string): Promise<F[]> {
  const out: F[] = [];
  let pageToken: string | undefined;
  do {
    const page = await google<{ files?: F[]; nextPageToken?: string }>(email, "/drive/v3/files", {
      query: { supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: "allDrives", pageSize: 200, pageToken, fields: "nextPageToken,files(id,name)", q: "name contains 'Q-' and trashed = false" },
    });
    out.push(...(page.files ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken && out.length < 3000);
  return out;
}

export async function renameToHash(email: string): Promise<{ renamed: number; failed: string[]; left: number }> {
  const plan = new Map<string, { from: string; to: string }>();
  for (const f of await searchQ(email)) {
    const to = hashedName(f.name);
    if (to) plan.set(f.id, { from: f.name, to });
  }
  // Job folders named with a plain number, in the real stage folders or one level down (year folders), and the files in them.
  const live = (await googleSettings()).live.folders;
  const top = await listChildren(email, Object.values(live), true);
  const nested = await listChildren(email, top.filter((f) => !parseJobFolderName(f.name)).map((f) => f.id), true);
  for (const folder of [...top, ...nested]) {
    const parsed = parseJobFolderName(folder.name);
    if (!parsed || folder.name.trim().startsWith("#") || /^Q/i.test(folder.name.trim())) continue;
    const to = hashedPlainNumber(folder.name, parsed.number);
    if (to) plan.set(folder.id, { from: folder.name, to });
    const inside = await listChildren(email, [folder.id]);
    const deeper = await listChildren(email, inside.filter((f) => f.mimeType.endsWith("folder")).map((f) => f.id));
    for (const f of [...inside, ...deeper]) {
      const t = hashedPlainNumber(f.name, parsed.number);
      if (t) plan.set(f.id, { from: f.name, to: t });
    }
  }

  const items = [...plan.entries()];
  const failed: string[] = [];
  let renamed = 0;
  // Five at a time, stopping after about four minutes so the page never hangs; pressing again carries on.
  const started = Date.now();
  let next = 0;
  const worker = async () => {
    while (next < items.length && Date.now() - started < 240_000) {
      const [id, n] = items[next++];
      try {
        await google(email, `/drive/v3/files/${encodeURIComponent(id)}`, { method: "PATCH", query: { supportsAllDrives: true, fields: "id" }, body: { name: n.to } });
        renamed++;
      } catch (e) {
        failed.push(`${n.from}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  await audit(sql, email, "Drive names changed to #", "drive", "", { renamed, failed: failed.length, planned: items.length });
  return { renamed, failed, left: items.length - renamed - failed.length };
}
