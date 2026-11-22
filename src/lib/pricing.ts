/**
 * Pricing with Batt's pricing spreadsheet. The sheet does every sum: the app only writes
 * the job's items into a copy and reads the answers back. Pure functions here, tested.
 *
 * Rules learned the hard way (see the brief, section 8):
 *  - Job Pricing rows start at 5. Only columns B (area), C (product) and D (quantity) are written.
 *  - An item not on the price list also gets E (material cost each) and G (labour hours each),
 *    written as single cells. Column F is never written: a blank there wipes its formula.
 *  - The product name must be the price list's own key (column L), spacing and all.
 */

export const FIRST_ROW = 5;
export const MAX_ITEMS = 150;

export type Product = { key: string; label: string; section: string; materials: number; hours: number };

export type PricingItem = {
  area: string;
  /** Exact price list key, or null for an item that isn't on the list. */
  key: string | null;
  /** What it is, for the client. For list items this is filled from the list. */
  description: string;
  qty: number;
  /** Only for items not on the list: cost of materials each, ex VAT, and labour hours each. */
  materialEach?: number;
  hoursEach?: number;
};

export type PricingInput = {
  items: PricingItem[];
  miles: number;
  people: number;
  vans: number;
  parking: number;
  waste: number;
  access: number;
  other: number;
  /** One electrician, no apprentice: the full electrician rate applies to every hour. */
  oneElectrician: boolean;
};

export type PricingResult = {
  sellExVat: number;
  vat: number;
  sellIncVat: number;
  labourSell: number;
  materialsSell: number;
  prelimsSell: number;
  beforeMinimum: number;
  minimumCharge: number;
  labourHours: number;
  siteDays: number;
  netProfit: number;
  netMargin: number; // percent
  targetMargin: number; // percent
};

export type QuoteLine = { kind: string; description: string; detail: string; qty: number; rate: number; cost: number; amount: number };

type Cell = string | number | boolean | null | undefined;
const num = (c: Cell) => (typeof c === "number" && Number.isFinite(c) ? c : null);
const str = (c: Cell) => (c === null || c === undefined ? "" : String(c));
const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
const p2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Reads the Product Price List tab (columns B to L, unformatted).
 * B name, C brand, D finish, H total materials price, I labour hours, L the lookup key.
 */
export function parsePriceList(rows: Cell[][]): Product[] {
  const out: Product[] = [];
  let section = "";
  for (const r of rows) {
    const name = tidy(str(r[0]));
    const key = str(r[10]);
    const materials = num(r[6]);
    const hours = num(r[7]);
    if (key && (materials !== null || hours !== null) && name && name !== "-") {
      out.push({ key, label: tidy(key).replace(/( \|)+$/g, "").replace(/ \| - \| -$| \| -$/g, ""), section, materials: materials ?? 0, hours: hours ?? 0 });
    } else if (name && name !== "-" && name !== "Product Name" && materials === null && hours === null && !tidy(str(r[1])) ) {
      section = name;
    }
  }
  // Labels must be unique so a pick maps back to exactly one key.
  const seen = new Map<string, number>();
  for (const p of out) {
    const n = (seen.get(p.label) ?? 0) + 1;
    seen.set(p.label, n);
    if (n > 1) p.label = `${p.label} (${n})`;
  }
  return out;
}

/** Checks what was typed in before anything is sent to Google. Returns a list of problems. */
export function validatePricing(input: PricingInput, products: Product[]): string[] {
  const problems: string[] = [];
  const keys = new Set(products.map((p) => p.key));
  if (input.items.length === 0) problems.push("Add at least one item to price.");
  if (input.items.length > MAX_ITEMS) problems.push(`That's more than ${MAX_ITEMS} lines. Split it into two pricings.`);
  input.items.forEach((it, i) => {
    const n = `Line ${i + 1}`;
    if (!(it.qty > 0)) problems.push(`${n}: the quantity must be more than 0.`);
    if (it.key !== null) {
      if (!keys.has(it.key)) problems.push(`${n}: "${tidy(it.key)}" isn't on the price list any more. Pick it again.`);
    } else {
      if (!tidy(it.description)) problems.push(`${n}: say what the item is.`);
      if (!(typeof it.materialEach === "number" && it.materialEach >= 0)) problems.push(`${n}: add the material cost each (0 if there's none).`);
      if (!(typeof it.hoursEach === "number" && it.hoursEach >= 0)) problems.push(`${n}: add the labour hours each (0 if there's none).`);
    }
  });
  if (!(input.miles >= 0) || !Number.isFinite(input.miles)) problems.push("Add the exact round-trip road miles from 18 Alwin Close (0 if there's no travel).");
  if (!(input.people >= 1)) problems.push("People on site must be at least 1.");
  if (!(input.vans >= 0)) problems.push("Vans can't be negative.");
  for (const [k, label] of [["parking", "Parking"], ["waste", "Waste"], ["access", "Access hire"], ["other", "Other"]] as const) {
    if (!(input[k] >= 0)) problems.push(`${label} can't be negative.`);
  }
  return problems;
}

export type RangeWrite = { range: string; values: (string | number)[][] };

/** The exact cells to write into a fresh copy of the pricing sheet. */
export function buildWrites(input: PricingInput): RangeWrite[] {
  const last = FIRST_ROW + input.items.length - 1;
  const writes: RangeWrite[] = [
    { range: `'Job Pricing'!B${FIRST_ROW}:D${last}`, values: input.items.map((it) => [tidy(it.area), it.key ?? tidy(it.description), it.qty]) },
  ];
  input.items.forEach((it, i) => {
    if (it.key === null) {
      const row = FIRST_ROW + i;
      writes.push({ range: `'Job Pricing'!E${row}`, values: [[it.materialEach ?? 0]] });
      writes.push({ range: `'Job Pricing'!G${row}`, values: [[it.hoursEach ?? 0]] });
    }
  });
  writes.push(
    { range: "Profit!C12:C14", values: [[input.miles], [input.people], [input.vans]] },
    { range: "Profit!C17:C20", values: [[input.parking], [input.waste], [input.access], [input.other]] },
  );
  if (input.oneElectrician) writes.push({ range: "Rates!C9", values: [[0]] });
  return writes;
}

const LABELS: Record<keyof PricingResult, string> = {
  sellExVat: "Sell price, ex VAT (£)",
  vat: "VAT (£)",
  sellIncVat: "Sell price, inc VAT (£)",
  labourSell: "Labour sell (£)",
  materialsSell: "Materials sell (£)",
  prelimsSell: "Prelims sell (£)",
  beforeMinimum: "Price before minimum charge (£)",
  minimumCharge: "Minimum charge (£)",
  labourHours: "Labour hours",
  siteDays: "Site days",
  netProfit: "Net profit (£)",
  netMargin: "Net margin",
  targetMargin: "Target net margin",
};

/** Reads Profit!B5:C41 (unformatted) by label. Throws if any figure is missing or not a number. */
export function parseProfit(rows: Cell[][]): PricingResult {
  const byLabel = new Map<string, Cell>();
  for (const r of rows) if (str(r[0])) byLabel.set(tidy(str(r[0])), r[1]);
  const out = {} as PricingResult;
  for (const [field, label] of Object.entries(LABELS) as [keyof PricingResult, string][]) {
    if (!byLabel.has(label)) throw new Error(`The pricing sheet's Profit tab has no "${label}" line. Has the template changed?`);
    const v = byLabel.get(label);
    // The sheet shows a dash for nil prelims.
    const n = num(v) ?? (tidy(str(v)) === "-" || str(v) === "" ? 0 : null);
    if (n === null) throw new Error(`The pricing sheet gave "${str(v)}" for "${label}", which isn't a number.`);
    out[field] = field === "netMargin" || field === "targetMargin" ? Math.round(n * 1000) / 10 : field === "labourHours" || field === "siteDays" ? n : p2(n);
  }
  return out;
}

/**
 * Turns the sheet's answers into the job's quote lines. Rows are Job Pricing B..M (unformatted)
 * for the item rows. Throws, naming the line, if the sheet didn't price a line.
 * The lines always add up to the sell price exactly.
 */
export function buildLines(input: PricingInput, rows: Cell[][], result: PricingResult, perMile: number): QuoteLine[] {
  const lines: QuoteLine[] = input.items.map((it, i) => {
    const r = rows[i] ?? [];
    const what = it.key ? tidy(it.key) : tidy(it.description);
    const hoursEach = num(r[5]);
    const labour = num(r[9]);
    const materials = num(r[10]);
    const total = num(r[11]);
    if (total === null || labour === null || materials === null || (it.key && hoursEach === null)) {
      throw new Error(`The pricing sheet couldn't price line ${i + 1} (${what}). The product name may not match the price list.`);
    }
    return { kind: "item", description: it.description || what, detail: tidy(it.area), qty: it.qty, rate: p2(total / it.qty), cost: p2(materials), amount: p2(total) };
  });
  if (result.prelimsSell > 0) {
    const bits = [
      input.miles > 0 ? `${input.miles} miles round trip at ${Math.round(perMile * 100)}p a mile` : "",
      input.parking > 0 ? "parking" : "",
      input.waste > 0 ? "waste disposal" : "",
      input.access > 0 ? "access equipment" : "",
      input.other > 0 ? "other site costs" : "",
    ].filter(Boolean);
    lines.push({ kind: "prelims", description: "Travel and site costs", detail: bits.join(", "), qty: 1, rate: result.prelimsSell, cost: 0, amount: result.prelimsSell });
  }
  const sum = () => p2(lines.reduce((s, l) => s + l.amount, 0));
  if (result.sellExVat - sum() > 0.05 && result.minimumCharge > 0 && result.beforeMinimum < result.minimumCharge) {
    lines.push({ kind: "minimum", description: "Minimum charge (half a day)", detail: "", qty: 1, rate: 0, cost: 0, amount: p2(result.sellExVat - sum()) });
  }
  // Each line is rounded to the penny, so the lines can be a few pence out from the sheet's total.
  const diff = p2(result.sellExVat - sum());
  if (Math.abs(diff) > 0.05) {
    throw new Error(`The lines add up to £${sum().toFixed(2)} but the sheet's price is £${result.sellExVat.toFixed(2)}. Open the pricing sheet and check it.`);
  }
  if (diff !== 0) {
    const biggest = lines.reduce((a, b) => (b.amount > a.amount ? b : a));
    biggest.amount = p2(biggest.amount + diff);
  }
  return lines;
}

/** Green, amber or red against the sheet's own target margin. */
export function pricingLight(r: Pick<PricingResult, "netMargin" | "targetMargin">, redBelow: number) {
  return r.netMargin >= r.targetMargin ? "green" : r.netMargin < redBelow ? "red" : "amber";
}
