import "server-only";
import { sql } from "../db";
import { folderAreaFor, type Stage } from "../jobs-rules";
import { errorText, google, googleSettings, type GoogleArea } from "./client";
import { JOB_SUBFOLDERS, jobFolderName } from "./format";

const FOLDER = "application/vnd.google-apps.folder";
const ALL = { supportsAllDrives: true } as const;

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  webViewLink?: string;
  modifiedTime?: string;
  trashed?: boolean;
};

const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export async function createFolder(email: string, name: string, parent: string) {
  return google<DriveFile>(email, "/drive/v3/files", {
    method: "POST",
    query: { ...ALL, fields: "id,name,webViewLink" },
    body: { name, mimeType: FOLDER, parents: [parent] },
  });
}

export async function getFile(email: string, id: string) {
  return google<DriveFile>(email, `/drive/v3/files/${encodeURIComponent(id)}`, {
    query: { ...ALL, fields: "id,name,mimeType,parents,webViewLink,trashed" },
  });
}

export async function moveFile(email: string, id: string, from: string, to: string) {
  return google<DriveFile>(email, `/drive/v3/files/${encodeURIComponent(id)}`, {
    method: "PATCH",
    query: { ...ALL, addParents: to, removeParents: from, fields: "id,parents" },
    body: {},
  });
}

/** Everything directly inside any of the given folders. */
export async function listChildren(email: string, parents: string[], onlyFolders = false) {
  if (parents.length === 0) return [];
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const page = await google<{ files: DriveFile[]; nextPageToken?: string }>(email, "/drive/v3/files", {
      query: {
        ...ALL,
        includeItemsFromAllDrives: true,
        corpora: "allDrives",
        pageSize: 200,
        pageToken,
        orderBy: "name",
        fields: "nextPageToken,files(id,name,mimeType,parents,webViewLink,modifiedTime)",
        q: `(${parents.map((p) => `'${q(p)}' in parents`).join(" or ")}) and trashed = false${onlyFolders ? ` and mimeType = '${FOLDER}'` : ""}`,
      },
    });
    out.push(...(page.files ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken && out.length < 1000);
  return out;
}

/** Creates any of the eight standard subfolders that are missing. */
async function ensureSubfolders(email: string, folderId: string) {
  const have = new Set((await listChildren(email, [folderId], true)).map((f) => f.name));
  for (const name of JOB_SUBFOLDERS) if (!have.has(name)) await createFolder(email, name, folderId);
}

const AREA_WORDS: Record<GoogleArea, string> = { Live: "Live", Lost: "Lost", Active: "Active", Completed: "Completed" };

/**
 * Makes a numbered job's Drive folder if it has none, and moves it when the stage calls for it.
 * Never throws: a problem is saved on the job and shown there with a retry button.
 */
export async function syncJobFolder(jobId: string, email: string): Promise<string> {
  const [job] = await sql<{ number: number | null; stage: Stage; site: string; client: string | null; drive_folder_id: string }[]>`
    select j.number, j.stage, j.site, c.name as client, j.drive_folder_id
    from jobs j left join clients c on c.id = j.client_id where j.id = ${jobId}`;
  if (!job || job.number === null) return "";
  try {
    const settings = await googleSettings();
    const folders = settings[settings.mode].folders;
    const area = folderAreaFor(job.stage);
    const testNote = settings.mode === "test" ? " (test folder)" : "";
    let message = "";

    if (!job.drive_folder_id) {
      const target = folders[area ?? "Live"];
      // If a folder for this number is already there (say a half-finished earlier try), use it.
      const existing = (await listChildren(email, [target], true)).find((f) => f.name === String(job.number) || f.name.startsWith(`${job.number} `));
      const folder = existing ?? (await createFolder(email, jobFolderName({ number: job.number, client: job.client, site: job.site }), target));
      await ensureSubfolders(email, folder.id);
      const url = folder.webViewLink ?? `https://drive.google.com/drive/folders/${folder.id}`;
      await sql`update jobs set drive_folder_id = ${folder.id}, drive_folder_url = ${url}, drive_error = '', updated_at = now() where id = ${jobId}`;
      message = `Drive folder ${existing ? "linked" : "created"} in ${AREA_WORDS[area ?? "Live"]}${testNote}.`;
    } else if (area) {
      const file = await getFile(email, job.drive_folder_id);
      const parent = file.parents?.[0];
      const known = Object.values(folders);
      if (parent === folders[area]) {
        message = "";
      } else if (parent && known.includes(parent)) {
        await moveFile(email, job.drive_folder_id, parent, folders[area]);
        message = `Drive folder moved to ${AREA_WORDS[area]}${testNote}.`;
      } else {
        message =
          settings.mode === "test"
            ? "Drive folder left where it is, because the app is in test mode."
            : "Drive folder left where it is, because it isn't in one of the four standard folders.";
      }
      await sql`update jobs set drive_error = '' where id = ${jobId}`;
    }
    return message;
  } catch (e) {
    const text = errorText(e);
    await sql`update jobs set drive_error = ${text} where id = ${jobId}`;
    return `Drive folder not updated: ${text}`;
  }
}

export type FolderListing = { name: string; id: string; url: string; files: DriveFile[] }[];

/** The job folder's contents: loose files first, then each subfolder with its files. */
export async function listJobFiles(email: string, folderId: string): Promise<FolderListing> {
  const top = await listChildren(email, [folderId]);
  const subs = top.filter((f) => f.mimeType === FOLDER);
  const inside = await listChildren(email, subs.map((s) => s.id));
  const loose = top.filter((f) => f.mimeType !== FOLDER);
  return [
    ...(loose.length ? [{ name: "In the job folder", id: folderId, url: "", files: loose }] : []),
    ...subs.map((s) => ({ name: s.name, id: s.id, url: s.webViewLink ?? "", files: inside.filter((f) => f.parents?.includes(s.id)) })),
  ];
}
