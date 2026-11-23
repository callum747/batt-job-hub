/** A first draft of the quote's content from the priced job, for a person to check and edit. Pure, tested. */
import type { PricingInput } from "./pricing";
import type { InvestmentLine, Person, ScheduleGroup, ShortQuote } from "./quote-short";

type Line = { kind: string; description: string; detail: string; qty: number; amount: number };
const p2 = (n: number) => Math.round(n * 100) / 100;
const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : String(p2(n)));

export function plusDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const uk = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export const DEFAULT_ASSUMPTIONS = [
  "The existing supply and circuits have capacity for the proposed works",
  "Clear access to all work areas, with furniture and fragile items moved by the client before we arrive",
];

export function defaultShortQuote(args: {
  number: number;
  client: { name: string; notes: string; payment_days: number | null } | null;
  site: string;
  postcode: string;
  description: string;
  pricing: PricingInput;
  lines: Line[];
  subtotal: number;
  preparedBy: Person;
  today: string; // YYYY-MM-DD
}): ShortQuote {
  const { pricing, lines } = args;
  // Schedule: the priced items grouped by area, in the order they were priced.
  const groups: ScheduleGroup[] = [];
  for (const it of pricing.items) {
    const area = it.area.trim() || "General";
    let g = groups.find((x) => x.area.toLowerCase() === area.toLowerCase());
    if (!g) groups.push((g = { area, items: [] }));
    const what = it.description.trim() || (it.key ?? "").split("|")[0].trim();
    const finish = it.key ? it.key.split("|").slice(1).map((s) => s.trim()).filter((s) => s && s !== "-").join(", ") : "";
    g.items.push({ item: what, ref: qtyText(it.qty), works: `Supply and fit ${qtyText(it.qty)} × ${what.toLowerCase()}${finish ? ` (${finish})` : ""}` });
  }
  const investment: InvestmentLine[] = lines.map((l) => ({
    section: l.kind === "item" ? l.detail || "Works" : l.kind === "prelims" ? "Travel and site costs" : "Minimum charge",
    description: l.kind === "item" ? `${qtyText(l.qty)} × ${l.description}` : l.kind === "prelims" ? l.detail || "Travel and site costs" : "Half-day minimum charge",
    amount: p2(l.amount),
  }));
  const subtotal = p2(args.subtotal);
  const vat = p2(subtotal * 0.2);
  const firstSentence = args.description.split(/(?<=[.!?])\s/)[0]?.trim() ?? "";
  const project = (firstSentence.length > 0 && firstSentence.length <= 60 ? firstSentence.replace(/[.]$/, "") : args.site) || "Electrical works";
  return {
    number: args.number,
    client: args.client?.name ?? "",
    project,
    site: [args.site, args.postcode].filter((s) => s && !args.site.toUpperCase().includes(args.postcode.toUpperCase())).join(", ") || args.site,
    date: uk(args.today),
    validUntil: uk(plusDays(args.today, 30)),
    preparedBy: args.preparedBy,
    summary: args.description.trim(),
    installation: "All work is installed, tested and certified to BS 7671, with NAPIT certification on completion.",
    schedule: groups,
    investment,
    subtotal,
    vat,
    total: p2(subtotal + vat),
    deposit: !/no deposit/i.test(args.client?.notes ?? ""),
    paymentDays: args.client?.payment_days ?? 7,
    exclusions: [],
    assumptions: [...DEFAULT_ASSUMPTIONS],
  };
}
