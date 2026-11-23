/**
 * Fills Batt's survey proposal template. Same three passes as the short form.
 * Survey schedule: a bold blue row per site (SITE NAME, ADDRESS, POSTCODE in capitals),
 * then a row per unit with its area (or "tbc") and what is surveyed there.
 */
import {
  captureGroupStyles, cellText, findTable, findTableByCell, groupStylePass, money, paragraphs, replaceInParagraph, resizeRows,
  setCell, setParagraph, toBatch, type Doc, type Edit, type GroupStyles, type Para, type Request,
} from "./docs";
import type { Person } from "./quote-short";
import type { SurveyLine, SurveySite } from "./survey";

export type SurveyQuote = {
  number: number;
  client: string;
  siteName: string; // for the cover and the thank-you line
  siteAddress: string; // with postcode
  date: string;
  validUntil: string;
  preparedBy: Person;
  summary: string; // two sentences: who asked, which site, what's surveyed, how many days
  sites: SurveySite[];
  days: number;
  lines: SurveyLine[]; // Survey, and Mileage when there are miles
  subtotal: number;
  vat: number;
  total: number;
  paymentDays: number;
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const p2 = (n: number) => Math.round(n * 100) / 100;
const daysText = (d: number) => `${Number.isInteger(d) ? d : d.toFixed(1)} day${d === 1 ? "" : "s"}`;

export function checkSurveyQuote(q: SurveyQuote): string[] {
  const out: string[] = [];
  const text = [q.client, q.siteName, q.siteAddress, q.summary, ...q.sites.flatMap((s) => [s.name, s.address, s.postcode, ...s.units.flatMap((u) => [u.name, u.area, u.scope])]), ...q.lines.map((l) => l.description)];
  if (text.some((t) => /[[\]]/.test(t))) out.push("Take out the square brackets: anything in [ ] looks like an unfilled placeholder.");
  if (!clean(q.client)) out.push("The proposal needs the client's name.");
  if (!clean(q.siteName) || !clean(q.siteAddress)) out.push("Add the site name and address for the cover.");
  if (!clean(q.summary)) out.push("Write the survey summary.");
  if (q.sites.length === 0) out.push("Add at least one site to the schedule.");
  q.sites.forEach((s, i) => {
    if (!clean(s.name) || !clean(s.postcode)) out.push(`Site ${i + 1} needs its name and postcode.`);
    if (s.units.length === 0) out.push(`Site ${i + 1} needs at least one unit.`);
    if (s.units.some((u) => !clean(u.name) || !clean(u.scope))) out.push(`Every unit at site ${i + 1} needs a name and what's being surveyed.`);
  });
  if (q.lines.length < 1 || q.lines.length > 2 || q.lines[0].section !== "Survey" || (q.lines[1] && q.lines[1].section !== "Mileage")) out.push("The price must be the survey days, and the mileage if there is any.");
  const sum = p2(q.lines.reduce((s, l) => s + l.amount, 0));
  if (sum !== p2(q.subtotal)) out.push(`The lines add up to ${money(sum)}, not the subtotal of ${money(q.subtotal)}.`);
  if (p2(q.subtotal * 0.2) !== p2(q.vat)) out.push(`VAT should be ${money(p2(q.subtotal * 0.2))}.`);
  if (p2(q.subtotal + q.vat) !== p2(q.total)) out.push("The total isn't the subtotal plus VAT.");
  if (!(q.days > 0)) out.push("The number of survey days is missing.");
  if (!(q.paymentDays >= 1 && q.paymentDays <= 120)) out.push("Payment days should be between 1 and 120.");
  return out;
}

function need<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`The survey proposal template has changed: couldn't find ${what}.`);
  return v;
}

const scheduleTable = (doc: Doc) => need(findTable(doc, ["Item", "Area (sq ft)", "Survey scope"]), "the survey schedule (Item, Area, Survey scope)");
const investmentTable = (doc: Doc) => need(findTable(doc, ["Section", "Description", "Subtotal ex VAT"]), "the investment table");
const rowsFor = (q: SurveyQuote) => q.sites.reduce((n, s) => n + 1 + s.units.length, 0);
const kinds = (q: SurveyQuote) => q.sites.flatMap((s) => ["group", ...s.units.map(() => "item")]) as ("group" | "item")[];

export function locateSurvey(doc: Doc) {
  const ps = paragraphs(doc.body?.content);
  const first = (t: (p: Para) => boolean) => ps.find(t);
  const all = (t: (p: Para) => boolean) => ps.filter(t);
  const refs = all((p) => p.text.includes("Q-[000]"));
  const dates = all((p) => p.text.trim() === "[DD/MM/YYYY]");
  return {
    refs: need(refs.length === 2 ? refs : null, "the two Q-[000] references"),
    client: need(first((p) => p.text.trim() === "[Client name]"), "[Client name]"),
    siteLine: need(first((p) => p.text.includes("[Site name]") && p.text.includes("[Site address, postcode]")), "the site line on the cover"),
    dates: need(dates.length === 2 ? dates : null, "the two dates"),
    preparedBy: need(ps[ps.findIndex((p) => p.text.trim() === "PREPARED BY") + 1], "the name under PREPARED BY"),
    summary: need(first((p) => p.text.startsWith("[Two sentences")), "the survey summary placeholder"),
    schedule: scheduleTable(doc),
    investment: investmentTable(doc),
    totals: need(findTableByCell(doc, "Subtotal", 1), "the totals table"),
    paymentLine: need(first((p) => p.text.includes("within 7 days of invoice")), "the payment days line"),
    daysAssumption: need(first((p) => p.text.includes("[number] day(s)")), "the survey days assumption"),
    thanks: need(first((p) => p.text.includes("[site name]")), "the thank-you paragraph"),
    signature: need(first((p) => p.text.startsWith("[Name]") && p.text.includes("[email]")), "the signature line"),
  };
}

export function captureSurveyStyles(doc: Doc): GroupStyles {
  return captureGroupStyles(scheduleTable(doc), 1, 2);
}

/** Pass 1: the schedule's rows, and the mileage row when there are no miles. */
export function surveyStructurePass(doc: Doc, q: SurveyQuote): Request[] {
  const l = locateSurvey(doc);
  const mileageRow = l.investment.rows.findIndex((r) => cellText(r[0]).trim() === "Mileage");
  const dropMileage: Edit | null =
    q.lines.length === 1 && mileageRow > 0
      ? { at: l.investment.start, requests: [{ deleteTableRow: { tableCellLocation: { tableStartLocation: { index: l.investment.start }, rowIndex: mileageRow, columnIndex: 0 } } }] }
      : null;
  return toBatch([resizeRows(l.schedule, 1, l.schedule.rows.length - 1, rowsFor(q)), dropMileage]);
}

/** Pass 2: every word. */
export function surveyTextPass(doc: Doc, q: SurveyQuote): Request[] {
  const l = locateSurvey(doc);
  const edits: (Edit | null)[] = [];
  for (const p of l.refs) edits.push(replaceInParagraph(p, "Q-[000]", `#${q.number}`));
  edits.push(setParagraph(l.client, clean(q.client)));
  edits.push(replaceInParagraph(l.siteLine, "[Site address, postcode]", clean(q.siteAddress)));
  edits.push(replaceInParagraph(l.siteLine, "[Site name]", clean(q.siteName)));
  edits.push(setParagraph(l.dates[0], q.date), setParagraph(l.dates[1], q.validUntil));
  edits.push(setParagraph(l.preparedBy, q.preparedBy.name));
  edits.push(setParagraph(l.summary, clean(q.summary)));

  const rows = q.sites.flatMap((s) => [
    [[s.name, s.address, s.postcode].map(clean).filter(Boolean).join(", ").toUpperCase(), "", ""],
    ...s.units.map((u) => [clean(u.name), clean(u.area) || "tbc", clean(u.scope)]),
  ]);
  if (rows.length !== l.schedule.rows.length - 1) throw new Error("The survey schedule doesn't have the right number of rows yet.");
  rows.forEach((r, i) => r.forEach((text, c) => edits.push(...setCell(l.schedule.rows[i + 1][c], text))));

  const body = l.investment.rows.slice(1);
  if (body.length !== q.lines.length) throw new Error("The investment table doesn't have the right number of rows yet.");
  q.lines.forEach((line, i) => {
    if (cellText(body[i][0]).trim() !== line.section) throw new Error(`The investment table's row ${i + 1} should be ${line.section}.`);
    edits.push(...setCell(body[i][1], clean(line.description)), ...setCell(body[i][2], money(line.amount)));
  });

  const totalsRow = (label: string) => need(l.totals.rows.find((r) => cellText(r[1]).trim() === label), `the ${label} row`);
  edits.push(...setCell(totalsRow("Subtotal")[2], money(q.subtotal)));
  edits.push(...setCell(totalsRow("VAT @ 20%")[2], money(q.vat)));
  edits.push(...setCell(totalsRow("Total (inc VAT)")[2], money(q.total)));

  if (q.paymentDays !== 7) edits.push(replaceInParagraph(l.paymentLine, "within 7 days of invoice", `within ${q.paymentDays} days of invoice`));
  edits.push(replaceInParagraph(l.daysAssumption, "[number] day(s)", daysText(q.days)));
  edits.push(replaceInParagraph(l.thanks, "[site name]", clean(q.siteName)));
  edits.push(replaceInParagraph(l.signature, "[email]@battelectrical.com", q.preparedBy.email));
  edits.push(replaceInParagraph(l.signature, "[Job title]", q.preparedBy.title));
  edits.push(replaceInParagraph(l.signature, "[Name]", q.preparedBy.name));
  return toBatch(edits);
}

/** Pass 3: site rows bold blue, unit rows plain. */
export function surveyStylePass(doc: Doc, q: SurveyQuote, styles: GroupStyles): Request[] {
  return groupStylePass(scheduleTable(doc), kinds(q), styles);
}
