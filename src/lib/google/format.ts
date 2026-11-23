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
  return [`#${j.number}`, clean(j.client ?? ""), clean(j.site)].filter(Boolean).join(" – ");
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

/**
 * Reads a job folder's name the way Batt writes them: "#560 – Client – Site" (an en dash or a hyphen), or the
 * older "560 – …" and "Q-560 – …". Null for anything that doesn't start with a job number (templates, "00 - …", notes).
 */
export function parseJobFolderName(name: string): { number: number; client: string; site: string } | null {
  const m = name.trim().match(/^(?:#|Q-?)?\s*(\d{3,4})(?:\s*[–—-]\s*(.*))?$/i);
  if (!m) return null;
  const number = Number(m[1]);
  if (number < 100) return null;
  // A folder called just "2026" is a year folder (Completed is split by year), not job #2026.
  if (!m[2] && !name.trim().startsWith("#") && number >= 2000 && number <= 2099) return null;
  const parts = (m[2] ?? "").split(/\s+[–—-]\s+/).map((s) => s.trim()).filter(Boolean);
  return { number, client: parts[0] ?? "", site: parts.slice(1).join(" – ") };
}

/** The stage a job folder found in Drive is given, from the folder it's in. */
export const STAGE_FOR_AREA = { Live: "Draft quote", Active: "Booked", Completed: "Paid", Lost: "Lost" } as const;

/**
 * A file or folder name with old job references turned into the # form: "Q-552 – Meterz" → "#552 – Meterz",
 * "3 Grove Court, Q-518.pdf" → "3 Grove Court, #518.pdf". Null when nothing should change (templates with
 * [placeholders], test items, names with no Q- reference).
 */
export function hashedName(name: string): string | null {
  if (/[[\]]/.test(name) || /^TEST\b/i.test(name.trim())) return null;
  const next = name.replace(/(?<![A-Za-z])Q-?(\d{3,4})(?!\d)/g, "#$1");
  return next === name ? null : next;
}

/** A name that starts with a plain job number ("558 – David Marshall") gets its #. Null if it doesn't. */
export function hashedPlainNumber(name: string, number: number): string | null {
  return new RegExp(`^${number}(\\s*[–—-]\\s|$)`).test(name.trim()) ? `#${name.trim()}` : null;
}
