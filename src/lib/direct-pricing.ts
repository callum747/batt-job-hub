/**
 * Pricing a job straight from lines: day rates, call-out rates, mileage, materials at an agreed figure. This is how
 * Batt prices day-rate, survey, call-out and labour-only work, which never went through the pricing spreadsheet.
 * The sums here are only quantity x rate and adding up. Pure, tested.
 */
import type { PricingInput, PricingResult, QuoteLine } from "./pricing";
import type { ScheduleGroup } from "./quote-short";

export type DirectKind = "labour" | "materials" | "travel" | "other";
export type DirectLine = {
  kind: DirectKind;
  /** The heading it sits under on the quote's price table, e.g. "Labour", "Travel", "Materials". */
  section: string;
  /** The line as the client reads it, e.g. "Installation engineer, 1 day at £380". */
  description: string;
  qty: number;
  /** Price per unit, ex VAT. 0 for something given free of charge. */
  rate: number;
  /** What the line costs Batt, ex VAT, if known. Used only for the margin. */
  cost?: number;
  /** Labour lines: how many days of one person's work this is. */
  days?: number;
};
export type DirectInput = { lines: DirectLine[]; schedule: ScheduleGroup[]; miles: number; people: number; vans: number; note: string };
export type DirectSaved = { schedule: ScheduleGroup[]; marginKnown: boolean; note: string; lines: DirectLine[] };

const p2 = (n: number) => Math.round(n * 100) / 100;
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
export const lineAmount = (l: Pick<DirectLine, "qty" | "rate">) => p2(l.qty * l.rate);

export function checkDirect(input: DirectInput): string[] {
  const out: string[] = [];
  if (input.lines.length === 0) out.push("Add at least one line to price.");
  input.lines.forEach((l, i) => {
    const n = `Line ${i + 1}`;
    if (!clean(l.description)) out.push(`${n}: say what it is.`);
    if (!clean(l.section)) out.push(`${n}: give it a heading, such as Labour, Travel or Materials.`);
    if (!(l.qty > 0)) out.push(`${n}: the quantity must be more than 0.`);
    if (!(l.rate >= 0) || !Number.isFinite(l.rate)) out.push(`${n}: the rate can't be negative.`);
    if (l.cost !== undefined && !(l.cost >= 0)) out.push(`${n}: the cost can't be negative.`);
  });
  if (input.schedule.length === 0 || input.schedule.some((g) => !clean(g.area) || g.items.length === 0 || g.items.some((i) => !clean(i.item) || !clean(i.works))))
    out.push("The schedule of works needs at least one area, and every line needs the item and the works.");
  const text = [...input.lines.flatMap((l) => [l.section, l.description]), ...input.schedule.flatMap((g) => [g.area, ...g.items.flatMap((i) => [i.item, i.ref, i.works])])];
  if (text.some((t) => /[[\]]/.test(t))) out.push("Take out the square brackets: anything in [ ] looks like an unfilled placeholder.");
  if (!(input.miles >= 0)) out.push("Miles can't be negative.");
  if (!(input.people >= 1)) out.push("People on site must be at least 1.");
  return out;
}

/** The figures the rest of the app expects from a pricing, worked out from the lines. */
export function directResult(input: DirectInput, vatPct: number, targetMargin: number): { result: PricingResult; marginKnown: boolean } {
  const sum = (kinds: DirectKind[]) => p2(input.lines.filter((l) => kinds.includes(l.kind)).reduce((s, l) => s + lineAmount(l), 0));
  const sellExVat = p2(input.lines.reduce((s, l) => s + lineAmount(l), 0));
  const vat = p2((sellExVat * vatPct) / 100);
  // Travel is passed on at cost unless a cost is given. The margin is only known if every other line has its cost.
  const marginKnown = input.lines.every((l) => l.kind === "travel" || l.cost !== undefined);
  const cost = p2(input.lines.reduce((s, l) => s + (l.cost ?? (l.kind === "travel" ? lineAmount(l) : 0)), 0));
  const days = input.lines.filter((l) => l.kind === "labour").reduce((s, l) => s + (l.days ?? 0), 0);
  const netProfit = marginKnown ? p2(sellExVat - cost) : 0;
  return {
    marginKnown,
    result: {
      sellExVat, vat, sellIncVat: p2(sellExVat + vat),
      labourSell: sum(["labour"]), materialsSell: sum(["materials", "other"]), prelimsSell: sum(["travel"]),
      beforeMinimum: sellExVat, minimumCharge: 0,
      labourHours: days * 8, siteDays: p2(days / Math.max(1, input.people)),
      netProfit, netMargin: marginKnown && sellExVat > 0 ? Math.round((netProfit / sellExVat) * 1000) / 10 : 0,
      targetMargin,
    },
  };
}

/** The job's quote lines. Travel keeps the mileage wording as its detail; the rest are shown exactly as written. */
export function directQuoteLines(input: DirectInput): QuoteLine[] {
  return input.lines.map((l) =>
    l.kind === "travel"
      ? { kind: "prelims", description: "Travel", detail: clean(l.description), qty: l.qty, rate: l.rate, cost: l.cost ?? lineAmount(l), amount: lineAmount(l) }
      : { kind: "direct", description: clean(l.description), detail: clean(l.section), qty: l.qty, rate: l.rate, cost: l.cost ?? 0, amount: lineAmount(l) },
  );
}

/** What's kept as the pricing's inputs, in the same shape a spreadsheet pricing keeps. */
export function directPricingInput(input: DirectInput): PricingInput {
  return { items: [], miles: input.miles, people: input.people, vans: input.vans, parking: 0, waste: 0, access: 0, other: 0, oneElectrician: false };
}
