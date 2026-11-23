/**
 * Fills Batt's short-form quote template. Pure: takes the document as Google returns it and
 * the quote's content, and gives back the edits to send. Three passes, each on a fresh read:
 *   1. structure: table rows added or removed, unused paragraphs removed
 *   2. text: every placeholder and name filled, from the end of the document backwards
 *   3. style: schedule rows given room or item styling (new rows copy the row above them)
 * Then the document is read again and must have no "[" left anywhere.
 */
import {
  cellText, findTable, findTableByCell, money, paragraphs, replaceInParagraph, resizeRows, setCell, setParagraph, toBatch,
  type Doc, type Edit, type FoundTable, type Para, type Request,
} from "./docs";

export type ScheduleGroup = { area: string; items: { item: string; ref: string; works: string }[] };
export type InvestmentLine = { section: string; description: string; amount: number };
export type Person = { name: string; title: string; email: string };

export type ShortQuote = {
  number: number;
  /** The quote's own reference, e.g. #557/2. Set when the document is made. */
  ref?: string;
  client: string;
  project: string; // short name for the job, e.g. "Kitchen sockets and new radial circuit"
  site: string; // address with postcode
  date: string; // DD/MM/YYYY
  validUntil: string; // DD/MM/YYYY
  preparedBy: Person;
  summary: string; // what the job is
  installation: string; // how it's installed, tested and certified
  schedule: ScheduleGroup[];
  investment: InvestmentLine[];
  subtotal: number;
  vat: number;
  total: number;
  deposit: boolean; // 20% deposit on acceptance (the template's terms), or 100% on completion
  paymentDays: number;
  exclusions: string[]; // job-specific ones, added after the standard three
  assumptions: string[];
};

const p2 = (n: number) => Math.round(n * 100) / 100;
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Checks the content before anything is sent to Google. Returns problems in plain English. */
export function checkShortQuote(q: ShortQuote): string[] {
  const out: string[] = [];
  const text = [q.client, q.project, q.site, q.summary, q.installation, ...q.exclusions, ...q.assumptions,
    ...q.schedule.flatMap((g) => [g.area, ...g.items.flatMap((i) => [i.item, i.ref, i.works])]), ...q.investment.flatMap((l) => [l.section, l.description])];
  if (text.some((t) => /[[\]]/.test(t))) out.push("Take out the square brackets: anything in [ ] looks like an unfilled placeholder.");
  if (!clean(q.client)) out.push("The quote needs the client's name.");
  if (!clean(q.project)) out.push("Give the job a short name for the cover.");
  if (!clean(q.site)) out.push("Add the site address and postcode.");
  if (!clean(q.summary)) out.push("Write the project summary.");
  if (!clean(q.installation)) out.push("Describe the installation.");
  if (q.schedule.length === 0 || q.schedule.some((g) => !clean(g.area) || g.items.length === 0)) out.push("Each area in the schedule needs a name and at least one item.");
  if (q.schedule.some((g) => g.items.some((i) => !clean(i.item) || !clean(i.works)))) out.push("Every schedule line needs the item and the works.");
  if (q.investment.length === 0) out.push("The investment table needs at least one line.");
  if (q.investment.some((l) => !clean(l.section))) out.push("Every investment line needs a section name.");
  if (q.assumptions.filter((a) => clean(a)).length === 0) out.push("Add at least one assumption.");
  const sum = p2(q.investment.reduce((s, l) => s + l.amount, 0));
  if (sum !== p2(q.subtotal)) out.push(`The investment lines add up to ${money(sum)}, not the subtotal of ${money(q.subtotal)}.`);
  if (p2(q.subtotal * 0.2) !== p2(q.vat)) out.push(`VAT should be ${money(p2(q.subtotal * 0.2))}.`);
  if (p2(q.subtotal + q.vat) !== p2(q.total)) out.push("The total isn't the subtotal plus VAT.");
  if (!(q.paymentDays >= 1 && q.paymentDays <= 120)) out.push("Payment days should be between 1 and 120.");
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(q.date) || !/^\d{2}\/\d{2}\/\d{4}$/.test(q.validUntil)) out.push("The dates must be DD/MM/YYYY.");
  return out;
}

type Located = {
  ref: Para[]; // paragraphs holding Q-[000]
  client: Para;
  projectLine: Para;
  dates: Para[]; // [date, valid until]
  preparedBy: Para;
  summary: Para;
  installation: Para;
  schedule: FoundTable;
  investment: FoundTable;
  totals: FoundTable;
  stages: FoundTable;
  paymentLine: Para;
  jobExclusion: Para | null; // removed in pass 1 when the job has no exclusions of its own
  assumptions: Para[];
  thanks: Para;
  signature: Para;
  depositLine: Para;
};

function need<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`The short-form template has changed: couldn't find ${what}.`);
  return v;
}

/** Finds every part of the template that gets filled. Fails loudly if the template has changed. */
export function locate(doc: Doc): Located {
  const ps = paragraphs(doc.body?.content);
  const first = (test: (p: Para) => boolean) => ps.find(test);
  const all = (test: (p: Para) => boolean) => ps.filter(test);
  const assumptionsHeading = ps.findIndex((p) => p.text.trim() === "Assumptions");
  const nextSection = ps.findIndex((p, i) => i > assumptionsHeading && /^0\d\s/.test(p.text.trim()));
  return {
    ref: need(all((p) => p.text.includes("Q-[000]")).length === 2 ? all((p) => p.text.includes("Q-[000]")) : null, "the two Q-[000] references"),
    client: need(first((p) => p.text.trim() === "[Client name]"), "[Client name]"),
    projectLine: need(first((p) => p.text.includes("[Project name]") && p.text.includes("[Site address, postcode]")), "the project and site line"),
    dates: need(all((p) => p.text.trim() === "[DD/MM/YYYY]").length === 2 ? all((p) => p.text.trim() === "[DD/MM/YYYY]") : null, "the two dates"),
    preparedBy: need(ps[ps.findIndex((p) => p.text.trim() === "PREPARED BY") + 1], "the name under PREPARED BY"),
    summary: need(first((p) => p.text.startsWith("[Two or three sentences")), "the project summary placeholder"),
    installation: need(first((p) => p.text.startsWith("[Describe the installation")), "the installation placeholder"),
    schedule: need(findTable(doc, ["Item", "Ref", "Works"]), "the schedule table (Item, Ref, Works)"),
    investment: need(findTable(doc, ["Section", "Description", "Subtotal ex VAT"]), "the investment table"),
    totals: need(findTableByCell(doc, "Subtotal", 1), "the totals table"),
    stages: need(findTable(doc, ["Stage", "Amount"]), "the payment stages table"),
    paymentLine: need(first((p) => p.text.includes("within 7 days of invoice")), "the payment days line"),
    jobExclusion: first((p) => p.text.trim() === "[Job-specific exclusion]") ?? null,
    assumptions: need(
      assumptionsHeading >= 0 ? ps.slice(assumptionsHeading + 1, nextSection > 0 ? nextSection : undefined).filter((p) => p.paragraph.bullet) : null,
      "the assumptions",
    ),
    thanks: need(first((p) => p.text.includes("[project name]")), "the thank-you paragraph"),
    signature: need(first((p) => p.text.startsWith("Cameron Batt") && p.text.includes("@")), "the signature line"),
    depositLine: need(first((p) => p.text.startsWith("A 20% deposit is required")), "the deposit paragraph"),
  };
}

const del = (p: Para): Edit => ({ at: p.start, requests: [{ deleteContentRange: { range: { startIndex: p.start, endIndex: p.end } } }] });

export const scheduleRows = (q: ShortQuote) => q.schedule.reduce((n, g) => n + 1 + g.items.length, 0);

/** Pass 1: table rows and spare paragraphs. */
export function structurePass(doc: Doc, q: ShortQuote): Request[] {
  const l = locate(doc);
  const extraAssumptions = l.assumptions.slice(1); // the first one is kept and filled
  return toBatch([
    resizeRows(l.schedule, 1, l.schedule.rows.length - 1, scheduleRows(q)),
    resizeRows(l.investment, 1, l.investment.rows.length - 1, q.investment.length),
    resizeRows(l.stages, 1, l.stages.rows.length - 1, q.deposit ? 2 : 1),
    q.exclusions.filter((e) => clean(e)).length === 0 && l.jobExclusion ? del(l.jobExclusion) : null,
    ...extraAssumptions.map(del),
  ]);
}

/** Pass 2: every word. */
export function textPass(doc: Doc, q: ShortQuote): Request[] {
  const l = locate(doc);
  const edits: (Edit | null)[] = [];
  for (const p of l.ref) edits.push(replaceInParagraph(p, "Q-[000]", (q.ref ?? `#${q.number}`)));
  edits.push(setParagraph(l.client, clean(q.client)));
  edits.push(replaceInParagraph(l.projectLine, "[Site address, postcode]", clean(q.site)));
  edits.push(replaceInParagraph(l.projectLine, "[Project name]", clean(q.project)));
  edits.push(setParagraph(l.dates[0], q.date), setParagraph(l.dates[1], q.validUntil));
  edits.push(setParagraph(l.preparedBy, q.preparedBy.name));
  edits.push(setParagraph(l.summary, clean(q.summary)));
  edits.push(setParagraph(l.installation, clean(q.installation)));

  // Schedule: a room row then its items, for each area.
  const rows = q.schedule.flatMap((g) => [
    ["room", g.area.toUpperCase(), "", ""] as const,
    ...g.items.map((i) => ["item", clean(i.item), clean(i.ref), clean(i.works)] as const),
  ]);
  if (rows.length !== l.schedule.rows.length - 1) throw new Error("The schedule table doesn't have the right number of rows yet.");
  rows.forEach((r, i) => [1, 2, 3].forEach((c) => edits.push(...setCell(l.schedule.rows[i + 1][c - 1], r[c]))));

  if (q.investment.length !== l.investment.rows.length - 1) throw new Error("The investment table doesn't have the right number of rows yet.");
  q.investment.forEach((line, i) => {
    const row = l.investment.rows[i + 1];
    edits.push(...setCell(row[0], clean(line.section)), ...setCell(row[1], clean(line.description)), ...setCell(row[2], money(line.amount)));
  });

  const totalsRow = (label: string) => need(l.totals.rows.find((r) => cellText(r[1]).trim() === label), `the ${label} row`);
  edits.push(...setCell(totalsRow("Subtotal")[2], money(q.subtotal)));
  edits.push(...setCell(totalsRow("VAT @ 20%")[2], money(q.vat)));
  edits.push(...setCell(totalsRow("Total (inc VAT)")[2], money(q.total)));

  if (q.deposit) {
    // Template already reads Deposit, on acceptance 20% / On completion 80%
  } else {
    edits.push(...setCell(l.stages.rows[1][0], "On completion"), ...setCell(l.stages.rows[1][1], "100%"));
    edits.push(setParagraph(l.depositLine, "No deposit is needed. To go ahead, simply reply to this quotation or email info@battelectrical.com."));
  }
  if (q.paymentDays !== 7) edits.push(replaceInParagraph(l.paymentLine, "within 7 days of invoice", `within ${q.paymentDays} days of invoice`));

  const exclusions = q.exclusions.map(clean).filter(Boolean);
  if (exclusions.length) {
    if (!l.jobExclusion) throw new Error("The job-specific exclusion line has gone, so the exclusions can't be added.");
    edits.push(setParagraph(l.jobExclusion, exclusions.join("\n")));
  } else if (l.jobExclusion) {
    throw new Error("The job-specific exclusion line should have been removed first.");
  }
  const assumptions = q.assumptions.map(clean).filter(Boolean);
  if (l.assumptions.length !== 1) throw new Error("The assumptions list hasn't been tidied yet.");
  edits.push(setParagraph(l.assumptions[0], assumptions.join("\n")));

  edits.push(replaceInParagraph(l.thanks, "[project name]", clean(q.project)));
  // Signature: "Cameron Batt   Managing Director, Batt Electrical  |  01296 321321  |  cameron@battelectrical.com"
  edits.push(replaceInParagraph(l.signature, "cameron@battelectrical.com", q.preparedBy.email));
  edits.push(replaceInParagraph(l.signature, "Managing Director", q.preparedBy.title));
  edits.push(replaceInParagraph(l.signature, "Cameron Batt", q.preparedBy.name));
  return toBatch(edits);
}

const scheduleTable = (doc: Doc) => need(findTable(doc, ["Item", "Ref", "Works"]), "the schedule table (Item, Ref, Works)");

export type RowStyles = { room: Record<string, unknown>[]; item: Record<string, unknown>[] };

/** Reads how a room row and an item row are styled, from the untouched template (rows 1 and 2). */
export function captureRowStyles(doc: Doc): RowStyles {
  const t = scheduleTable(doc);
  const styleOf = (cell: Para[]) => cell[0]?.paragraph.elements?.[0]?.textRun?.textStyle ?? {};
  return { room: t.rows[1].map(styleOf), item: t.rows[2].map(styleOf) };
}

/** Pass 3: gives every schedule row the room or item look, whatever row it was copied from. */
export function stylePass(doc: Doc, q: ShortQuote, styles: RowStyles): Request[] {
  // Runs after the text pass, so it finds the table by its header row, not by placeholders.
  const t = scheduleTable(doc);
  const kindsCount = q.schedule.reduce((n, g) => n + 1 + g.items.length, 0);
  if (t.rows.length - 1 !== kindsCount) throw new Error("The schedule table doesn't have the right number of rows.");
  const kinds = q.schedule.flatMap((g) => ["room", ...g.items.map(() => "item")]) as ("room" | "item")[];
  const out: Request[] = [];
  kinds.forEach((kind, i) => {
    t.rows[i + 1].forEach((cell, c) => {
      const p = cell[0];
      if (!p || p.end - 1 <= p.start) return; // empty cell
      const style = styles[kind][c] ?? {};
      const fields = [...new Set([...Object.keys(styles.room[c] ?? {}), ...Object.keys(styles.item[c] ?? {})])];
      if (fields.length === 0) return;
      out.push({ updateTextStyle: { range: { startIndex: p.start, endIndex: p.end - 1 }, textStyle: style, fields: fields.join(",") } });
    });
  });
  return out;
}
