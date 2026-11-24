import type { LongQuote, PointColumn, RoomPoints } from "./quote-long";
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
    section: l.kind === "item" || l.kind === "direct" ? l.detail || "Works" : l.kind === "prelims" ? "Travel and site costs" : "Minimum charge",
    // A line priced directly (a day rate, a call-out) is shown exactly as it was written.
    description: l.kind === "direct" ? l.description : l.kind === "item" ? `${qtyText(l.qty)} × ${l.description}` : l.kind === "prelims" ? l.detail || "Travel and site costs" : "Half-day minimum charge",
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

// ---------- Long form ----------

/** Which point-schedule column a priced item counts towards, from its price list name. Null if none. */
export function pointColumn(name: string): PointColumn | null {
  const n = name.toLowerCase();
  if (/(switch|dimmer) module/.test(n)) return null; // a switch module sits behind a plate already counted
  if (/usb/.test(n) && /socket/.test(n)) return "USB";
  if (/worktop/.test(n)) return "WT";
  if (/double socket/.test(n)) return "DS";
  if (/fused spur/.test(n)) return "FS";
  if (/data|cat6/.test(n)) return "Data";
  if (/emergency/.test(n)) return "EM";
  if (/downlight/.test(n)) return "DL";
  if (/pendant|chandelier/.test(n)) return "Pend";
  if (/smoke|heat detector|carbon monoxide/.test(n)) return "Det";
  if (/switch|dimmer|pullcord/.test(n) && !/isolator/.test(n)) return "Sw";
  return null;
}

/** Investment section for a price list section. */
const SECTION_NAMES: Record<string, string> = {
  "Power & Data": "Power and data",
  Lighting: "Lighting",
  Switching: "Switching and controls",
  "Fire Alarm": "Fire detection",
  Ventilation: "Ventilation",
  "Miscellanous": "Distribution and other works",
  Miscellaneous: "Distribution and other works",
};

type LongArgs = Parameters<typeof defaultShortQuote>[0] & {
  /** Price list section for each priced product key. */
  sectionOf: (key: string) => string | null;
  clientType: string;
};

export function defaultLongQuote(a: LongArgs): LongQuote {
  const short = defaultShortQuote(a);
  const items = a.pricing.items;
  const itemLines = a.lines.filter((l) => l.kind === "item");
  const nameOf = (i: number) => items[i].description.trim() || (items[i].key ?? "").split("|")[0].trim();

  // Scope summary: total quantity of each item across all rooms.
  const scope: { item: string; qty: number }[] = [];
  items.forEach((it, i) => {
    const name = nameOf(i);
    const s = scope.find((x) => x.item.toLowerCase() === name.toLowerCase());
    if (s) s.qty += it.qty;
    else scope.push({ item: name, qty: it.qty });
  });

  // Investment: priced lines grouped by their price list section, travel on Preliminaries.
  const sections: { section: string; names: string[]; amount: number }[] = [];
  itemLines.forEach((l, i) => {
    const it = items[i];
    const raw = it?.key ? a.sectionOf(it.key) : null;
    const section = (raw && SECTION_NAMES[raw.trim()]) || raw?.trim() || "Other works";
    let s = sections.find((x) => x.section === section);
    if (!s) sections.push((s = { section, names: [], amount: 0 }));
    const label = `${Number.isInteger(l.qty) ? l.qty : l.qty} × ${l.description.toLowerCase()}`;
    if (!s.names.includes(label)) s.names.push(label);
    s.amount = Math.round((s.amount + l.amount) * 100) / 100;
  });
  // Lines priced directly keep their own headings and wording.
  for (const l of a.lines.filter((x) => x.kind === "direct")) {
    const section = l.detail || "Works";
    let s = sections.find((x) => x.section === section);
    if (!s) sections.push((s = { section, names: [], amount: 0 }));
    s.names.push(l.description);
    s.amount = Math.round((s.amount + l.amount) * 100) / 100;
  }
  const minimum = a.lines.filter((l) => l.kind === "minimum").reduce((s, l) => s + l.amount, 0);
  if (minimum > 0) sections.push({ section: "Minimum charge", names: ["Half-day minimum charge"], amount: Math.round(minimum * 100) / 100 });
  const prelims = Math.round(a.lines.filter((l) => l.kind === "prelims").reduce((s, l) => s + l.amount, 0) * 100) / 100;

  // Per-point rates, only from items actually priced on this job (never guessed).
  const rateFor = (test: RegExp) => {
    const i = items.findIndex((it, k) => test.test((it.key ?? nameOf(k)).toLowerCase()) && !/usb/i.test(it.key ?? ""));
    return i >= 0 && itemLines[i] ? Math.round((itemLines[i].amount / itemLines[i].qty) * 100) / 100 : null;
  };

  // Point schedule: each priced item counted in its room's column.
  const rooms: RoomPoints[] = [];
  items.forEach((it, i) => {
    const col = pointColumn(it.key ?? nameOf(i));
    if (!col) return;
    const room = it.area.trim() || "General";
    let r = rooms.find((x) => x.room.toLowerCase() === room.toLowerCase());
    if (!r) rooms.push((r = { room, points: {} }));
    r.points[col] = (r.points[col] ?? 0) + it.qty;
  });

  // Lighting key: one line per kind of light fitting priced.
  const fittings: LongQuote["fittings"] = [];
  items.forEach((it, i) => {
    const col = pointColumn(it.key ?? nameOf(i));
    if (col !== "DL" && col !== "Pend" && col !== "EM") return;
    const parts = (it.key ?? nameOf(i)).split("|").map((s) => s.trim()).filter((s) => s && s !== "-");
    const fitting = [parts[1], parts[0]].filter(Boolean).join(" ") || nameOf(i);
    if (fittings.some((f) => f.fitting === fitting)) return;
    const prefix = col === "DL" ? "D" : col === "Pend" ? "P" : "EM";
    const n = fittings.filter((f) => f.ref.startsWith(prefix)).length + 1;
    fittings.push({ ref: `${prefix}${n}`, fitting, notes: parts[2] ?? "" });
  });

  const areas = [...new Set(items.map((it) => it.area.trim()).filter(Boolean))].join(", ") || "All areas";
  return {
    number: short.number,
    client: short.client,
    project: short.project,
    site: short.site,
    date: short.date,
    validUntil: short.validUntil,
    preparedBy: short.preparedBy,
    summary: short.summary,
    installation: short.installation,
    scope: scope.map((s) => ({ item: s.item, qty: String(Math.round(s.qty * 100) / 100) })),
    sections: sections.map((s) => ({ section: s.section, description: s.names.join(", "), amount: s.amount })),
    prelims,
    subtotal: short.subtotal,
    vat: short.vat,
    total: short.total,
    paymentDays: a.client?.payment_days ?? (/contractor/i.test(a.clientType) ? 30 : 7),
    rates: { socket: rateFor(/double socket/), downlight: rateFor(/downlight/), data: rateFor(/data/) },
    extras: [],
    programme: [
      { area: areas, works: "First fix: containment and cable runs" },
      { area: "Consumer unit position", works: "Distribution board and bonding" },
      { area: areas, works: "Second fix: accessories, fittings and circuit testing" },
      { area: "Whole installation", works: "Final testing, certification, snagging and handover" },
    ],
    exclusions: [],
    assumptions: ["The existing supply has sufficient capacity for the proposed installation", "Clear and continuous access to all work areas during standard working hours"],
    rooms,
    fittings,
  };
}
