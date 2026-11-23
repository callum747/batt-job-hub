/** Counting points off drawings: what a count looks like and how it becomes pricing lines. Pure, tested. */
import { z } from "zod";
import type { PricingItem, Product } from "./pricing";

export const CountSchema = z.object({
  drawings_read: z.array(z.string()).describe("The drawing titles or numbers you read, as printed in the title blocks."),
  legend: z.array(z.object({ symbol: z.string().describe("How the symbol looks or its label on the legend."), meaning: z.string() })).describe("The legend or key as printed on the drawings. Empty if there is none."),
  rooms: z.array(
    z.object({
      floor: z.string().describe("e.g. Ground, First. Empty if the drawings don't say."),
      room: z.string().describe("The room name as printed on the plan."),
      items: z.array(
        z.object({
          description: z.string().describe("What the point is, in plain words, e.g. 'Double socket', 'Downlight'."),
          qty: z.number().int().positive(),
          key: z.string().describe("The exact price list key from the list given, or empty if nothing on the list fits."),
          confidence: z.enum(["high", "medium", "low"]).describe("high: every symbol clear and counted once. medium: a few hard to tell apart or overlapping. low: guessed from an unclear area."),
          note: z.string().describe("Anything the estimator should check for this line. Empty if nothing."),
        }),
      ),
    }),
  ),
  not_counted: z.array(z.string()).describe("Things shown that you did not count as points, e.g. the consumer unit, extract fans on the mechanical drawings, items marked 'by others'."),
  questions: z.array(z.string()).describe("Questions for the client or designer where the drawings are unclear or contradict each other."),
});
export type DrawingCount = z.infer<typeof CountSchema>;

export type SavedCount = { count: DrawingCount; files: { id: string; name: string }[]; countedAt: string; by: string };

/** A drawing that's probably electrical, from its file name: these are ticked to start with. */
export function looksElectrical(name: string): boolean {
  const n = name.toLowerCase();
  if (/count check|markup|quote|pricing/.test(n)) return false;
  return /small power|lighting|electrical|power layout|socket|containment|fire alarm|data layout|\b8[0-9]_\d{3}|(^|[^a-z])e[-_ ]?\d{2,}/.test(n);
}

/** Pricing lines from a count: one line per room and product, quantities added up, in the order found. */
export function countToItems(count: DrawingCount, products: Product[]): { items: PricingItem[]; unmatched: number } {
  const known = new Set(products.map((p) => p.key));
  const items: PricingItem[] = [];
  let unmatched = 0;
  for (const r of count.rooms) {
    const area = [r.floor.trim() && !r.room.toLowerCase().includes(r.floor.trim().toLowerCase()) ? r.floor.trim() : "", r.room.trim()].filter(Boolean).join(" ") || "General";
    for (const it of r.items) {
      const key = known.has(it.key) ? it.key : null;
      if (key === null) unmatched++;
      const same = items.find((x) => x.area === area && x.key === key && (key !== null || x.description === it.description));
      if (same) same.qty += it.qty;
      else items.push({ area, key, description: key ? key.split("|")[0].trim() : it.description, qty: it.qty });
    }
  }
  return { items, unmatched };
}

/** Totals by product across all rooms, for a quick sense-check against the legend. */
export function countTotals(count: DrawingCount): { description: string; qty: number }[] {
  const out: { description: string; qty: number }[] = [];
  for (const r of count.rooms) {
    for (const it of r.items) {
      const name = it.key ? it.key.split("|")[0].trim() : it.description;
      const t = out.find((x) => x.description.toLowerCase() === name.toLowerCase());
      if (t) t.qty += it.qty;
      else out.push({ description: name, qty: it.qty });
    }
  }
  return out.sort((a, b) => b.qty - a.qty);
}
