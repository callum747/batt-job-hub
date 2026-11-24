/** The training matrix: who holds what, and what's running out. Pure, tested. */

export type Qualification = {
  id: string; person_id: string; person: string; name: string; number: string; issued: string | null; expires: string | null; file_url: string; notes: string; active: boolean;
};
export type CellState = "held" | "soon" | "expired" | "none";

const DAY = 86_400_000;
export const daysUntil = (today: string, date: string) => Math.round((Date.parse(date + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / DAY);

/** Held with no end date or a long way off; "soon" within `warnDays`; expired once the date has passed. */
export function qualState(q: Pick<Qualification, "expires">, today: string, warnDays = 60): Exclude<CellState, "none"> {
  if (!q.expires) return "held";
  const d = daysUntil(today, q.expires);
  return d < 0 ? "expired" : d <= warnDays ? "soon" : "held";
}

export type Matrix = { columns: string[]; rows: { personId: string; person: string; cells: { state: CellState; q: Qualification | null }[] }[] };

/**
 * People down the side, every qualification anyone holds across the top (most widely held first). If someone has
 * the same one twice (a renewed card), the one that lasts longest counts.
 */
export function buildMatrix(people: { id: string; short_name: string }[], quals: Qualification[], today: string): Matrix {
  const live = quals.filter((q) => q.active);
  const key = (s: string) => s.trim().toLowerCase();
  // How many different people hold each one (a renewed card held twice by one person counts once).
  const count = new Map<string, { name: string; who: Set<string> }>();
  for (const q of live) {
    const k = key(q.name);
    const c = count.get(k) ?? { name: q.name.trim(), who: new Set<string>() };
    c.who.add(q.person_id);
    count.set(k, c);
  }
  const columns = [...count.values()].sort((a, b) => b.who.size - a.who.size || a.name.localeCompare(b.name)).map((c) => c.name);
  const best = (a: Qualification, b: Qualification) => ((a.expires ?? "9999") >= (b.expires ?? "9999") ? a : b);
  return {
    columns,
    rows: people.map((p) => ({
      personId: p.id,
      person: p.short_name,
      cells: columns.map((c) => {
        const mine = live.filter((q) => q.person_id === p.id && key(q.name) === key(c));
        if (mine.length === 0) return { state: "none" as const, q: null };
        const q = mine.reduce(best);
        return { state: qualState(q, today), q };
      }),
    })),
  };
}

/** In words: "ECS Gold Card runs out in 12 days", "IPAF ran out 3 days ago". */
export function expiryText(q: Pick<Qualification, "name" | "expires">, today: string): string {
  if (!q.expires) return `${q.name} doesn't run out`;
  const d = daysUntil(today, q.expires);
  if (d < 0) return `${q.name} ran out ${-d} day${d === -1 ? "" : "s"} ago`;
  if (d === 0) return `${q.name} runs out today`;
  return `${q.name} runs out in ${d} day${d === 1 ? "" : "s"}`;
}
