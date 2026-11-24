import "server-only";
/**
 * A job's surveys live inside its own folder, in "09 - Surveys": a folder per site, a folder per unit
 * ("R21 – Ask Italian Restaurants Ltd"), then Electric, Gas and Water folders for the meters that unit has,
 * with the photos inside. This reads that and counts it. Read only.
 */
import { listChildren } from "./drive";

const FOLDER = "application/vnd.google-apps.folder";
export const SURVEYS_FOLDER = "09 - Surveys";

export type SurveySite = { name: string; url: string; units: number; meters: number; photos: number };
export type SurveySummary = { url: string; sites: SurveySite[]; units: number; meters: number; photos: number };

const link = (f: { id: string; webViewLink?: string }) => f.webViewLink ?? `https://drive.google.com/drive/folders/${f.id}`;
const isPhoto = (f: { mimeType: string; name: string }) => f.mimeType.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name);

/** The job's 09 - Surveys folder with its sites, units, meters and photos counted, or null if the job folder has none. */
export async function surveySummary(email: string, jobFolderId: string): Promise<SurveySummary | null> {
  const root = (await listChildren(email, [jobFolderId], true)).find((f) => /^09\b/.test(f.name.trim()));
  if (!root) return null;
  const inRoot = await listChildren(email, [root.id]);
  const sites = inRoot.filter((f) => f.mimeType === FOLDER);
  const inSites = await listChildren(email, sites.map((s) => s.id));
  const units = inSites.filter((f) => f.mimeType === FOLDER);
  const inUnits = await listChildren(email, units.map((u) => u.id));
  const meters = inUnits.filter((f) => f.mimeType === FOLDER);
  const inMeters = await listChildren(email, meters.map((m) => m.id));

  const siteOfUnit = new Map(units.map((u) => [u.id, u.parents?.[0] ?? ""]));
  const siteOfMeter = new Map(meters.map((m) => [m.id, siteOfUnit.get(m.parents?.[0] ?? "") ?? ""]));
  const out = sites.map((s) => {
    const photos =
      inSites.filter((f) => f.parents?.includes(s.id) && isPhoto(f)).length +
      inUnits.filter((f) => siteOfUnit.get(f.parents?.[0] ?? "") === s.id && isPhoto(f)).length +
      inMeters.filter((f) => siteOfMeter.get(f.parents?.[0] ?? "") === s.id && isPhoto(f)).length;
    return {
      name: s.name, url: link(s),
      units: units.filter((u) => u.parents?.includes(s.id)).length,
      meters: meters.filter((m) => siteOfMeter.get(m.id) === s.id).length,
      photos,
    };
  });
  const sum = (k: "units" | "meters" | "photos") => out.reduce((n, s) => n + s[k], 0);
  return { url: link(root), sites: out, units: sum("units"), meters: sum("meters"), photos: sum("photos") };
}
