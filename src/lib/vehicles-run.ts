import "server-only";
/** Vehicles with their data: the list, saving one, and its folder in Drive under 01 - Vehicles. */
import { sql } from "./db";
import { audit } from "./mutations";
import { todayUK } from "./jobs-rules";
import { dueItems, vehicleFolderName, type Due, type Vehicle } from "./vehicles";
import { createFolder, listChildren, type DriveFile } from "./google/drive";

export async function listVehicles(includeInactive = false): Promise<Vehicle[]> {
  const rows = await sql<Vehicle[]>`
    select v.id, v.name, v.registration, v.make_model, v.driver_id, p.short_name as driver, v.mot_due, v.tax_due, v.insurance_due, v.service_due,
      v.mpg, v.finance, v.notes, v.drive_folder_id, v.drive_folder_url, v.active
    from vehicles v left join people p on p.id = v.driver_id order by v.active desc, v.name`;
  return rows.map((r) => ({ ...r })).filter((v) => includeInactive || v.active);
}

export type VehicleInput = Partial<Pick<Vehicle, "name" | "registration" | "make_model" | "driver_id" | "mot_due" | "tax_due" | "insurance_due" | "service_due" | "mpg" | "finance" | "notes" | "active">>;

export async function saveVehicle(id: string | null, f: VehicleInput, actor: string): Promise<string> {
  const set = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) as Record<string, string | number | boolean | null>;
  if (typeof set.registration === "string") set.registration = set.registration.replace(/\s+/g, " ").trim().toUpperCase();
  if (id) {
    if (Object.keys(set).length) await sql`update vehicles set ${sql(set)}, updated_at = now() where id = ${id}`;
    await audit(sql, actor, "vehicle edited", "vehicle", id, { changed: Object.keys(set) });
    return id;
  }
  if (!String(set.name ?? "").trim()) throw new Error("Give the vehicle a name, such as \"Callum's Transporter\".");
  const [row] = await sql<{ id: string }[]>`insert into vehicles ${sql(set)} returning id`;
  await audit(sql, actor, "vehicle added", "vehicle", row.id, { name: set.name });
  return row.id;
}

async function vehiclesFolder() {
  const [row] = await sql<{ value: { folderId?: string; folderUrl?: string } }[]>`select value from settings where key = 'vehicles'`;
  return { id: row?.value?.folderId ?? "", url: row?.value?.folderUrl ?? "" };
}
export const vehiclesFolderUrl = async () => (await vehiclesFolder()).url;

/** Makes (or finds) the vehicle's own folder inside 01 - Vehicles, for its V5, MOT certificates, insurance and finance papers. */
export async function ensureVehicleFolder(id: string, email: string): Promise<string> {
  const [v] = await sql<{ name: string; registration: string; drive_folder_id: string }[]>`select name, registration, drive_folder_id from vehicles where id = ${id}`;
  if (!v) throw new Error("That vehicle doesn't exist.");
  if (v.drive_folder_id) return "It already has a folder.";
  const parent = await vehiclesFolder();
  if (!parent.id) throw new Error("The Vehicles folder isn't set.");
  const name = vehicleFolderName(v);
  const there = (await listChildren(email, [parent.id], true)).find((f) => f.name === name || (v.registration && f.name.toUpperCase().startsWith(v.registration.toUpperCase())));
  const folder = there ?? (await createFolder(email, name, parent.id));
  const url = folder.webViewLink ?? `https://drive.google.com/drive/folders/${folder.id}`;
  await sql`update vehicles set drive_folder_id = ${folder.id}, drive_folder_url = ${url}, updated_at = now() where id = ${id}`;
  await audit(sql, email, there ? "vehicle folder linked" : "vehicle folder made", "vehicle", id, { folder: name });
  return there ? "Linked to the folder that was already there." : "Folder made in 06 - Vehicles & Equipment › 01 - Vehicles.";
}

export async function vehicleFiles(email: string, folderId: string): Promise<DriveFile[]> {
  return (await listChildren(email, [folderId])).filter((f) => !f.mimeType.endsWith(".folder"));
}

export type VehicleDue = Due & { vehicle: string; registration: string };

/** Everything overdue or due within 30 days across the vans, soonest first. */
export async function vehiclesDue(today = todayUK()): Promise<VehicleDue[]> {
  return (await listVehicles())
    .flatMap((v) => dueItems(v, today).filter((d) => d.state !== "ok").map((d) => ({ ...d, vehicle: v.name, registration: v.registration })))
    .sort((a, b) => a.on.localeCompare(b.on));
}
