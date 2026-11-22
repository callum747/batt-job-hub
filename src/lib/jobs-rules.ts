/** Rules about job numbers and stages. Pure functions, shared by the server and the screens. */

export const STAGES = [
  "Enquiry",
  "Draft quote",
  "Quoted",
  "Booked",
  "In progress",
  "Complete",
  "Invoiced",
  "Paid",
  "On hold",
  "Lost",
  "Closed",
] as const;
export type Stage = (typeof STAGES)[number];

/** Stages shown as columns on the board, in order. */
export const BOARD_STAGES: Stage[] = ["Enquiry", "Draft quote", "Quoted", "Booked", "In progress", "Complete", "Invoiced", "On hold"];

/** A job still needing attention. */
export const OPEN_STAGES: Stage[] = ["Enquiry", "Draft quote", "Quoted", "Booked", "In progress", "Complete", "Invoiced", "On hold"];

/** A job gets its number the moment it is quoted, i.e. as soon as it moves to any of these. */
export const NUMBERED_STAGES: Stage[] = ["Draft quote", "Quoted", "Booked", "In progress", "Complete", "Invoiced", "Paid"];

export function needsNumber(stage: Stage, number: number | null) {
  return number === null && NUMBERED_STAGES.includes(stage);
}

/** Which Drive folder a job's folder lives in for each stage (used from Phase 2). */
export function folderAreaFor(stage: Stage): "Live" | "Active" | "Completed" | "Lost" | null {
  switch (stage) {
    case "Enquiry":
    case "Draft quote":
    case "Quoted":
      return "Live";
    case "Booked":
    case "In progress":
    case "Complete":
    case "Invoiced":
      return "Active";
    case "Paid":
    case "Closed":
      return "Completed";
    case "Lost":
      return "Lost";
    case "On hold":
      return null; // stays where it is
  }
}

/** How a job is shown: #557, an old reference such as 23-001, or TBC. */
export function jobLabel(j: { number: number | null; legacy_ref?: string }) {
  if (j.number !== null && j.number !== undefined) return `#${j.number}`;
  return j.legacy_ref || "TBC";
}

/** Turns "557", "#557", "Q-557" or "q557" into 557. Anything else gives null. */
export function parseJobNumber(text: string): number | null {
  const m = text.trim().match(/^(?:#|q-?)?\s*(\d{1,6})$/i);
  return m ? Number(m[1]) : null;
}

/** Next number = highest number in use (including numbers merged into other jobs) plus one. */
export function nextNumber(used: number[]) {
  return used.length ? Math.max(...used) + 1 : 1;
}

/** Dates a person sees are always UK format. */
export function ukDate(iso: string | null | undefined, opts: { weekday?: boolean } = {}) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  if (opts.weekday) {
    const date = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(date);
  }
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** Today's date in the UK as YYYY-MM-DD. */
export function todayUK(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}
