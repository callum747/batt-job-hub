/** Vehicles and the training matrix against a throwaway database, with Drive faked. Wipes TEST_DATABASE_URL. */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const made: { name: string; parent: string }[] = [];
vi.mock("./google/drive", () => ({
  listChildren: vi.fn(async () => made.map((m, i) => ({ id: `f${i}`, name: m.name, mimeType: "application/vnd.google-apps.folder", webViewLink: `https://drive/f${i}` }))),
  createFolder: vi.fn(async (_e: string, name: string, parent: string) => (made.push({ name, parent }), { id: `f${made.length - 1}`, name, webViewLink: `https://drive/f${made.length - 1}` })),
}));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("vehicles and training", () => {
  let sql: ReturnType<typeof postgres>;
  let v: typeof import("./vehicles-run");
  let t: typeof import("./training-run");
  let callum = "";

  beforeAll(async () => {
    const admin = postgres(url!, { max: 1, onnotice: () => {} });
    await admin.unsafe("drop schema public cascade; create schema public;");
    const dir = path.join(__dirname, "../../db/migrations");
    for (const f of readdirSync(dir).sort()) await admin.unsafe(readFileSync(path.join(dir, f), "utf8"));
    await admin.end();
    process.env.DATABASE_URL = url;
    sql = (await import("./db")).sql;
    v = await import("./vehicles-run");
    t = await import("./training-run");
    callum = (await sql`select id from people where short_name = 'Callum'`)[0].id;
  });
  afterAll(async () => {
    await sql?.end();
  });

  it("adds a van, lists what's due on it, and gives it a folder in the Vehicles folder once", async () => {
    const id = await v.saveVehicle(null, { name: "Callum's Transporter", registration: "ab12 cde", driver_id: callum, mot_due: "2026-12-06", insurance_due: "2027-06-01", mpg: 35 }, "tester");
    const [van] = await v.listVehicles();
    expect(van).toMatchObject({ name: "Callum's Transporter", registration: "AB12 CDE", driver: "Callum", mot_due: "2026-12-06", mpg: 35 });
    expect((await v.vehiclesDue("2026-11-24")).map((x) => [x.vehicle, x.what, x.days])).toEqual([["Callum's Transporter", "MOT", 12]]);
    expect(await v.ensureVehicleFolder(id, "office@battelectrical.com")).toBe("Folder made in 06 - Vehicles & Equipment › 01 - Vehicles.");
    expect(made).toEqual([{ name: "AB12 CDE – Callum's Transporter", parent: "1_CqLmnkqWZFC4EN_2yDAV8pCPP4XAc7c" }]);
    expect(await v.ensureVehicleFolder(id, "office@battelectrical.com")).toBe("It already has a folder.");
    await v.saveVehicle(id, { active: false }, "tester");
    expect(await v.listVehicles()).toEqual([]);
    expect(await v.vehiclesDue("2026-11-24")).toEqual([]);
    await expect(v.saveVehicle(null, { registration: "X" }, "tester")).rejects.toThrow("Give the vehicle a name");
  });

  it("starts with Callum's three qualifications, and flags a card that's running out", async () => {
    expect((await t.listQualifications()).map((q) => [q.person, q.name, q.expires])).toEqual([
      ["Callum", "AM2", null], ["Callum", "C&G 2391 Inspection and Testing", null], ["Callum", "Level 3 Electrotechnical NVQ", null],
    ]);
    expect(await t.trainingDue("2026-11-24")).toEqual([]);
    const id = await t.saveQualification(null, { person_id: callum, name: "ECS  Gold Card", number: "12345", expires: "2026-12-20" }, "tester");
    expect((await t.trainingDue("2026-11-24")).map((q) => [q.person, q.name, q.expires])).toEqual([["Callum", "ECS Gold Card", "2026-12-20"]]);
    await t.saveQualification(id, { active: false }, "tester");
    expect(await t.trainingDue("2026-11-24")).toEqual([]);
    await expect(t.saveQualification(null, { name: "IPAF" }, "tester")).rejects.toThrow("Say whose");
  });
});
