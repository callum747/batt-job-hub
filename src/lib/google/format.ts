/** Names and layouts for things the app makes in Google. Pure functions, tested. */

export const JOB_SUBFOLDERS = [
  "01 - Quote & Contract",
  "02 - Drawings & Specs",
  "03 - RAMS & Site H&S",
  "04 - Procurement",
  "05 - Variations",
  "06 - Site Photos",
  "07 - Testing & Certificates",
  "08 - Handover & O&M",
] as const;

const clean = (s: string) => s.replace(/[\\/]+/g, "-").replace(/\s+/g, " ").trim();

/** `557 – Client – Site` */
export function jobFolderName(j: { number: number; client: string | null; site: string }) {
  return [String(j.number), clean(j.client ?? ""), clean(j.site)].filter(Boolean).join(" – ");
}

export type EventInput = {
  jobNumber: number | null;
  client: string | null;
  contact: string;
  site: string; // with postcode
  work: string;
  notes: string;
  folderUrl: string;
  date: string; // YYYY-MM-DD
  start: string | null; // HH:MM
  end: string | null;
  confirmed: boolean;
  people: { short_name: string; email: string }[];
};

export function addDay(iso: string, n = 1) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** `#549 Hastings Fitness – Meter survey (Callum)` */
export function eventTitle(e: EventInput) {
  const who = e.people.map((p) => p.short_name).join(", ");
  const head = [e.jobNumber ? `#${e.jobNumber}` : "", e.client ?? ""].filter(Boolean).join(" ");
  const title = [head, e.work].filter(Boolean).join(" – ") || "Visit";
  return `${e.confirmed ? "" : "Pencilled in: "}${title}${who ? ` (${who})` : ""}`;
}

/** The body sent to Google Calendar for a visit. */
export function eventBody(e: EventInput) {
  const description = [
    e.client && `Client: ${e.client}`,
    e.contact && `Contact: ${e.contact}`,
    e.work && `Work: ${e.work}`,
    e.notes && `Notes: ${e.notes}`,
    e.folderUrl && `Job folder: ${e.folderUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
  const timed = Boolean(e.start);
  const endTime = e.end && e.start && e.end > e.start ? e.end : null;
  return {
    summary: eventTitle(e),
    location: e.site,
    description,
    start: timed ? { dateTime: `${e.date}T${e.start}:00`, timeZone: "Europe/London" } : { date: e.date },
    end: timed
      ? { dateTime: `${e.date}T${endTime ?? plusHour(e.start!)}:00`, timeZone: "Europe/London" }
      : { date: addDay(e.date) },
    attendees: e.people.filter((p) => p.email).map((p) => ({ email: p.email })),
  };
}

function plusHour(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(h + 1 > 23 ? 59 : m).padStart(2, "0")}`;
}
