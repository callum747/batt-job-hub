/** Vehicles: what's due on each one and how soon. Pure, tested. */

export type Vehicle = {
  id: string; name: string; registration: string; make_model: string; driver_id: string | null; driver: string | null;
  mot_due: string | null; tax_due: string | null; insurance_due: string | null; service_due: string | null;
  mpg: number | null; finance: string; notes: string; drive_folder_id: string; drive_folder_url: string; active: boolean;
};

export const DUE_KINDS = [
  ["mot_due", "MOT"],
  ["tax_due", "Road tax"],
  ["insurance_due", "Insurance"],
  ["service_due", "Service"],
] as const;

export type Due = { what: string; on: string; days: number; state: "overdue" | "soon" | "ok" };

const DAY = 86_400_000;
const between = (from: string, to: string) => Math.round((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / DAY);

/** Each date that's set on a vehicle, soonest first. "Soon" is within `warnDays`. */
export function dueItems(v: Pick<Vehicle, "mot_due" | "tax_due" | "insurance_due" | "service_due">, today: string, warnDays = 30): Due[] {
  return DUE_KINDS.flatMap(([key, what]) => {
    const on = v[key];
    if (!on) return [];
    const days = between(today, on);
    return [{ what, on, days, state: days < 0 ? ("overdue" as const) : days <= warnDays ? ("soon" as const) : ("ok" as const) }];
  }).sort((a, b) => a.on.localeCompare(b.on));
}

/** In words: "MOT due in 12 days", "Road tax 3 days overdue", "Insurance due today". */
export function dueText(d: Due): string {
  if (d.days < 0) return `${d.what} ${-d.days} day${d.days === -1 ? "" : "s"} overdue`;
  if (d.days === 0) return `${d.what} due today`;
  return `${d.what} due in ${d.days} day${d.days === 1 ? "" : "s"}`;
}

/** The folder a vehicle gets in Drive: its registration, then its name. */
export function vehicleFolderName(v: { registration: string; name: string }) {
  const reg = v.registration.replace(/\s+/g, " ").trim().toUpperCase();
  return [reg, v.name.replace(/[\\/]+/g, "-").trim()].filter(Boolean).join(" – ");
}
