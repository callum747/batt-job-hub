/** Counting a job's 09 - Surveys folder: sites, units, meters and photos. */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const F = "application/vnd.google-apps.folder";
type X = { id: string; name: string; mimeType: string; parents: string[]; webViewLink?: string };
const tree: X[] = [];
const add = (id: string, name: string, parent: string, mimeType = F) => tree.push({ id, name, mimeType, parents: [parent], webViewLink: mimeType === F ? `https://drive/${id}` : undefined });

vi.mock("./drive", () => ({
  listChildren: vi.fn(async (_e: string, parents: string[], onlyFolders = false) => tree.filter((f) => parents.includes(f.parents[0]) && (!onlyFolders || f.mimeType === F))),
}));

const { surveySummary } = await import("./survey-folder");

describe("a job's surveys", () => {
  it("says there's no folder when the job has none", async () => {
    add("q", "01 - Quote & Contract", "old");
    expect(await surveySummary("me", "old")).toBeNull();
  });

  it("counts sites, units, meters and photos from 09 - Surveys", async () => {
    add("s9", "09 - Surveys", "job");
    add("bell", "Bell Court, Stratford", "s9");
    add("tun", "Tunbridge Wells", "s9");
    add("r21", "R21 – Ask Italian Restaurants Ltd", "bell");
    add("r22", "R22 – Empty", "bell");
    add("e", "Electric", "r21");
    add("g", "Gas", "r21");
    for (const n of [1, 2, 3, 4]) add(`e${n}`, `Electric ${n}.jpg`, "e", "image/jpeg");
    add("g1", "IMG_0001.HEIC", "g", "application/octet-stream");
    add("note", "Notes.pdf", "g", "application/pdf");
    add("loose", "Front of unit.png", "r21", "image/png");
    add("u1", "Unit 1 – Costa", "tun");
    add("w", "Water", "u1");
    expect(await surveySummary("me", "job")).toEqual({
      url: "https://drive/s9",
      sites: [
        { name: "Bell Court, Stratford", url: "https://drive/bell", units: 2, meters: 2, photos: 6 },
        { name: "Tunbridge Wells", url: "https://drive/tun", units: 1, meters: 1, photos: 0 },
      ],
      units: 3, meters: 3, photos: 6,
    });
  });
});
