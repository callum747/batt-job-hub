/**
 * Fills Batt's long-form quote template (jobs of about £2,000 and over, and tenders).
 * Same three passes as the short form. The long form's tables alternate white and grey rows,
 * so the style pass re-shades every resized table to keep the stripes.
 *
 * The appendix (point schedule and lighting key) is filled when the rooms and points are known,
 * and removed only when there is nothing to put in it, as the template itself says.
 */
import {
  cellText, findTable, findTableByCell, money, paragraphs, replaceInParagraph, resizeRows, setCell, setParagraph, toBatch,
  type Doc, type Edit, type FoundTable, type Para, type Request, paraText } from "./docs";
import type { Person } from "./quote-short";

export const POINT_COLUMNS = ["DS", "USB", "WT", "FS", "Data", "DL", "Pend", "EM", "Sw", "Det"] as const;
export type PointColumn = (typeof POINT_COLUMNS)[number];
export type RoomPoints = { room: string; points: Partial<Record<PointColumn, number>> };

export type LongQuote = {
  number: number;
  /** The quote's own reference, e.g. #557/2. Set when the document is made. */
  ref?: string;
  client: string;
  project: string;
  site: string;
  date: string;
  validUntil: string;
  preparedBy: Person;
  summary: string;
  installation: string;
  scope: { item: string; qty: string }[];
  sections: { section: string; description: string; amount: number }[];
  prelims: number; // the Preliminaries line; 0 removes it
  subtotal: number;
  vat: number;
  total: number;
  paymentDays: number;
  /** The template's three per-point rates. null removes that row (the app never guesses a rate). */
  rates: { socket: number | null; downlight: number | null; data: number | null };
  extras: { item: string; description: string; price: number }[];
  programme: { area: string; works: string }[];
  exclusions: string[];
  assumptions: string[];
  rooms: RoomPoints[]; // the appendix; empty removes it
  fittings: { ref: string; fitting: string; notes: string }[];
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const p2 = (n: number) => Math.round(n * 100) / 100;
const STRIPE = [{ red: 1, green: 1, blue: 1 }, { red: 0.9647059, green: 0.972549, blue: 0.98039216 }]; // #ffffff, #f6f8fa

export function checkLongQuote(q: LongQuote): string[] {
  const out: string[] = [];
  const text = [q.client, q.project, q.site, q.summary, q.installation, ...q.scope.flatMap((s) => [s.item, s.qty]), ...q.sections.flatMap((s) => [s.section, s.description]),
    ...q.extras.flatMap((e) => [e.item, e.description]), ...q.programme.flatMap((p) => [p.area, p.works]), ...q.exclusions, ...q.assumptions, ...q.rooms.map((r) => r.room),
    ...q.fittings.flatMap((f) => [f.ref, f.fitting, f.notes])];
  if (text.some((t) => /[[\]]/.test(t))) out.push("Take out the square brackets: anything in [ ] looks like an unfilled placeholder.");
  if (!clean(q.client)) out.push("The quote needs the client's name.");
  if (!clean(q.project)) out.push("Give the job a short name for the cover.");
  if (!clean(q.site)) out.push("Add the site address and postcode.");
  if (!clean(q.summary)) out.push("Write the project summary.");
  if (!clean(q.installation)) out.push("Describe the scope of works.");
  if (q.scope.length === 0 || q.scope.some((s) => !clean(s.item) || !clean(s.qty))) out.push("Every scope summary line needs an item and a quantity.");
  if (q.sections.length === 0 || q.sections.some((s) => !clean(s.section) || !clean(s.description))) out.push("Every investment line needs a section and a description.");
  const sum = p2(q.sections.reduce((s, l) => s + l.amount, 0) + q.prelims);
  if (sum !== p2(q.subtotal)) out.push(`The investment lines add up to ${money(sum)}, not the subtotal of ${money(q.subtotal)}.`);
  if (p2(q.subtotal * 0.2) !== p2(q.vat)) out.push(`VAT should be ${money(p2(q.subtotal * 0.2))}.`);
  if (p2(q.subtotal + q.vat) !== p2(q.total)) out.push("The total isn't the subtotal plus VAT.");
  if (!(q.paymentDays >= 1 && q.paymentDays <= 120)) out.push("Payment days should be between 1 and 120.");
  for (const [k, v] of Object.entries(q.rates)) if (v !== null && !(v > 0)) out.push(`The ${k} rate must be more than £0, or left empty to remove it.`);
  if (q.extras.some((e) => !clean(e.item) || !(e.price > 0))) out.push("Every optional extra needs a name and a price.");
  if (q.programme.length === 0 || q.programme.some((p) => !clean(p.area) || !clean(p.works))) out.push("Every programme phase needs an area and the works.");
  if (q.assumptions.filter((a) => clean(a)).length === 0) out.push("Add at least one assumption.");
  if (q.rooms.some((r) => !clean(r.room))) out.push("Every room in the point schedule needs a name.");
  if (q.rooms.length > 0 && q.fittings.some((f) => !clean(f.ref) || !clean(f.fitting))) out.push("Every lighting fitting needs a reference and a description.");
  return out;
}

function need<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`The long-form template has changed: couldn't find ${what}.`);
  return v;
}

const T = {
  scope: (d: Doc) => need(findTable(d, ["Item", "Qty"]), "the scope summary table (Item, Qty)"),
  investment: (d: Doc) => need(findTable(d, ["Section", "Description", "Subtotal ex VAT"]), "the investment table"),
  totals: (d: Doc) => need(findTableByCell(d, "Subtotal", 1), "the totals table"),
  extras: (d: Doc) => need(findTable(d, ["Item", "Description", "Price ex VAT"]), "the optional extras table"),
  programme: (d: Doc) => need(findTable(d, ["Phase", "Area", "Works"]), "the programme table"),
  points: (d: Doc) => findTable(d, ["Room", "DS", "USB"]),
  fittings: (d: Doc) => findTable(d, ["Ref", "Fitting", "Notes"]),
};

const rowOf = (t: FoundTable, label: string, col = 0) => t.rows.findIndex((r) => cellText(r[col] ?? []).trim() === label);

/** Pass 1: rows in every table, spare bullets, and the appendix when there's nothing to put in it. */
export function longStructurePass(doc: Doc, q: LongQuote): Request[] {
  const ps = paragraphs(doc.body?.content);
  const edits: (Edit | null)[] = [];
  const delRow = (t: FoundTable, row: number): Edit => ({ at: t.start, requests: [{ deleteTableRow: { tableCellLocation: { tableStartLocation: { index: t.start }, rowIndex: row, columnIndex: 0 } } }] });
  const merge = (a: Edit | null, b: Edit | null): Edit | null => (!a ? b : !b ? a : { at: a.at, requests: [...a.requests, ...b.requests] });

  const scope = T.scope(doc);
  edits.push(resizeRows(scope, 1, scope.rows.length - 1, q.scope.length));

  // Investment: the four placeholder rows become one per section; the Preliminaries row stays last, or goes.
  const inv = T.investment(doc);
  const prelimRow = need(rowOf(inv, "Preliminaries") > 0 ? rowOf(inv, "Preliminaries") : null, "the Preliminaries row");
  edits.push(merge(q.prelims > 0 ? null : delRow(inv, prelimRow), resizeRows(inv, 1, prelimRow - 1, q.sections.length)));

  // Extras: the three rate rows go when there's no rate; the placeholder row becomes the job's own extras.
  const ex = T.extras(doc);
  const rateRows: [keyof LongQuote["rates"], string][] = [["data", "Additional data point"], ["downlight", "Additional downlight"], ["socket", "Additional double socket"]];
  let exEdit: Edit | null = null;
  for (const [k, label] of rateRows) {
    const r = rowOf(ex, label);
    if (r > 0 && q.rates[k] === null) exEdit = merge(exEdit, delRow(ex, r));
  }
  if (q.extras.length === 0) exEdit = merge(exEdit, delRow(ex, 1));
  else exEdit = merge(exEdit, resizeRows(ex, 1, 1, q.extras.length));
  if (q.extras.length === 0 && Object.values(q.rates).every((v) => v === null)) throw new Error("The optional extras table needs at least one row: add an extra or a rate.");
  edits.push(exEdit);

  const prog = T.programme(doc);
  edits.push(resizeRows(prog, 1, prog.rows.length - 1, q.programme.length));

  // Exclusions and assumptions
  const jobExcl = ps.find((p) => p.text.startsWith("[Fire alarm, CCTV"));
  if (jobExcl && q.exclusions.filter(clean).length === 0) edits.push({ at: jobExcl.start, requests: [{ deleteContentRange: { range: { startIndex: jobExcl.start, endIndex: jobExcl.end } } }] });
  const assm = ps.filter((p) => p.text.startsWith("[e.g.") && p.paragraph.bullet);
  for (const p of assm.slice(1)) edits.push({ at: p.start, requests: [{ deleteContentRange: { range: { startIndex: p.start, endIndex: p.end } } }] });

  // Appendix
  const appendixLabel = ps.find((p) => /^06\s+APPENDIX/.test(p.text.trim()));
  if (appendixLabel) {
    if (q.rooms.length === 0) {
      const breakPara = ps[ps.indexOf(appendixLabel) - 1];
      const start = breakPara && breakPara.text === "\n" ? breakPara.start : appendixLabel.start;
      const end = (doc.body?.content ?? []).at(-1)?.startIndex ?? appendixLabel.end;
      edits.push({ at: start, requests: [{ deleteContentRange: { range: { startIndex: start, endIndex: end } } }] });
    } else {
      const pts = need(T.points(doc), "the point schedule");
      const totalRow = need(rowOf(pts, "TOTAL") > 0 ? rowOf(pts, "TOTAL") : null, "the TOTAL row");
      // Keep the first plain room row; remove the floor headings and the rest, then add rows below it.
      const firstRoom = pts.rows.findIndex((r, i) => i > 0 && i < totalRow && r.length === 11 && cellText(r[1]).trim() === "–");
      if (firstRoom < 1) throw new Error("The long-form template has changed: couldn't find a room row in the point schedule.");
      const remove: number[] = [];
      for (let r = totalRow - 1; r >= 1; r--) if (r !== firstRoom) remove.push(r);
      const requests: Request[] = remove.map((r) => ({ deleteTableRow: { tableCellLocation: { tableStartLocation: { index: pts.start }, rowIndex: r, columnIndex: 0 } } }));
      for (let i = 1; i < q.rooms.length; i++) requests.push({ insertTableRow: { tableCellLocation: { tableStartLocation: { index: pts.start }, rowIndex: 1, columnIndex: 0 }, insertBelow: true } });
      edits.push({ at: pts.start, requests });

      const fit = T.fittings(doc);
      const keyHeading = ps.find((p) => p.text.trim() === "Lighting fitting key");
      if (fit && keyHeading) {
        if (q.fittings.length === 0) {
          edits.push({ at: keyHeading.start, requests: [{ deleteContentRange: { range: { startIndex: keyHeading.start, endIndex: (fit.block.endIndex ?? fit.start) } } }] });
        } else edits.push(resizeRows(fit, 1, fit.rows.length - 1, q.fittings.length));
      }
    }
  }
  return toBatch(edits);
}

const APPENDIX_NOTE = " Add a row per room; delete this page for smaller jobs.";

/** Pass 2: every word and number. */
export function longTextPass(doc: Doc, q: LongQuote): Request[] {
  const ps = paragraphs(doc.body?.content);
  const first = (t: (p: Para) => boolean, what: string) => need(ps.find(t), what);
  const edits: (Edit | null)[] = [];

  edits.push(replaceInParagraph(first((p) => p.text.includes("Q-[000]"), "Q-[000] on the cover"), "Q-[000]", (q.ref ?? `#${q.number}`)));
  edits.push(replaceInParagraph(first((p) => p.text.includes("[Q-000]"), "[Q-000] in the acceptance"), "[Q-000]", (q.ref ?? `#${q.number}`)));
  edits.push(setParagraph(first((p) => p.text.trim() === "[Client name]", "[Client name]"), clean(q.client)));
  const projectLine = first((p) => p.text.includes("[Project name]") && p.text.includes("[Site address, postcode]"), "the project and site line");
  edits.push(replaceInParagraph(projectLine, "[Site address, postcode]", clean(q.site)));
  edits.push(replaceInParagraph(projectLine, "[Project name]", clean(q.project)));
  const dates = ps.filter((p) => p.text.trim() === "[DD/MM/YYYY]");
  if (dates.length !== 2) need(null, "the two dates");
  edits.push(setParagraph(dates[0], q.date), setParagraph(dates[1], q.validUntil));
  edits.push(setParagraph(need(ps[ps.findIndex((p) => p.text.trim() === "PREPARED BY") + 1], "the name under PREPARED BY"), q.preparedBy.name));
  edits.push(setParagraph(first((p) => p.text.startsWith("[Two or three sentences"), "the project summary placeholder"), paraText(q.summary)));
  edits.push(setParagraph(first((p) => p.text.startsWith("[Describe the installation"), "the scope of works placeholder"), clean(q.installation)));

  const scope = T.scope(doc);
  if (scope.rows.length - 1 !== q.scope.length) throw new Error("The scope summary doesn't have the right number of rows yet.");
  q.scope.forEach((s, i) => edits.push(...setCell(scope.rows[i + 1][0], clean(s.item)), ...setCell(scope.rows[i + 1][1], clean(s.qty))));

  const inv = T.investment(doc);
  const body = inv.rows.slice(1);
  if (body.length !== q.sections.length + (q.prelims > 0 ? 1 : 0)) throw new Error("The investment table doesn't have the right number of rows yet.");
  q.sections.forEach((s, i) => edits.push(...setCell(body[i][0], clean(s.section)), ...setCell(body[i][1], clean(s.description)), ...setCell(body[i][2], money(s.amount))));
  if (q.prelims > 0) edits.push(...setCell(body[q.sections.length][2], money(q.prelims)));

  const totals = T.totals(doc);
  const tRow = (label: string) => need(totals.rows.find((r) => cellText(r[1]).trim() === label), `the ${label} row`);
  edits.push(...setCell(tRow("Subtotal")[2], money(q.subtotal)), ...setCell(tRow("VAT @ 20%")[2], money(q.vat)), ...setCell(tRow("Total (inc VAT)")[2], money(q.total)));

  edits.push(replaceInParagraph(first((p) => p.text.includes("[7/30]"), "the [7/30] payment days"), "[7/30]", String(q.paymentDays)));

  const ex = T.extras(doc);
  const exBody = ex.rows.slice(1);
  const fixed = new Map<string, number | null>([["Additional double socket", q.rates.socket], ["Additional downlight", q.rates.downlight], ["Additional data point", q.rates.data]]);
  const ownRows = exBody.filter((r) => !fixed.has(cellText(r[0]).trim()));
  if (ownRows.length !== q.extras.length) throw new Error("The optional extras table doesn't have the right number of rows yet.");
  q.extras.forEach((e, i) => edits.push(...setCell(ownRows[i][0], clean(e.item)), ...setCell(ownRows[i][1], clean(e.description)), ...setCell(ownRows[i][2], money(e.price))));
  for (const r of exBody) {
    const rate = fixed.get(cellText(r[0]).trim());
    if (rate !== undefined && rate !== null) edits.push(...setCell(r[2], money(rate)));
  }

  const prog = T.programme(doc);
  if (prog.rows.length - 1 !== q.programme.length) throw new Error("The programme doesn't have the right number of rows yet.");
  q.programme.forEach((p, i) => edits.push(...setCell(prog.rows[i + 1][0], String(i + 1)), ...setCell(prog.rows[i + 1][1], clean(p.area)), ...setCell(prog.rows[i + 1][2], clean(p.works))));

  const excl = q.exclusions.map(clean).filter(Boolean);
  const jobExcl = ps.find((p) => p.text.startsWith("[Fire alarm, CCTV"));
  if (excl.length) edits.push(setParagraph(need(jobExcl, "the job-specific exclusion line"), excl.join("\n")));
  const assm = ps.filter((p) => p.text.startsWith("[e.g.") && p.paragraph.bullet);
  if (assm.length !== 1) throw new Error("The assumptions haven't been tidied yet.");
  edits.push(setParagraph(assm[0], q.assumptions.map(clean).filter(Boolean).join("\n")));

  edits.push(replaceInParagraph(first((p) => p.text.includes("[project name]"), "the thank-you paragraph"), "[project name]", clean(q.project)));
  const sig = first((p) => p.text.startsWith("Cameron Batt") && p.text.includes("@"), "the signature line");
  edits.push(replaceInParagraph(sig, "cameron@battelectrical.com", q.preparedBy.email));
  edits.push(replaceInParagraph(sig, "Managing Director", q.preparedBy.title));
  edits.push(replaceInParagraph(sig, "Cameron Batt", q.preparedBy.name));

  if (q.rooms.length > 0) {
    // The template's note to whoever fills it in isn't for the client.
    const note = ps.find((p) => p.text.includes(APPENDIX_NOTE));
    if (note) edits.push(replaceInParagraph(note, APPENDIX_NOTE, ""));
    const pts = need(T.points(doc), "the point schedule");
    const totalRow = rowOf(pts, "TOTAL");
    if (totalRow - 1 !== q.rooms.length) throw new Error("The point schedule doesn't have the right number of rows yet.");
    q.rooms.forEach((r, i) => {
      const row = pts.rows[i + 1];
      edits.push(...setCell(row[0], clean(r.room)));
      POINT_COLUMNS.forEach((c, k) => edits.push(...setCell(row[k + 1], r.points[c] ? String(r.points[c]) : "–")));
    });
    POINT_COLUMNS.forEach((c, k) => edits.push(...setCell(pts.rows[totalRow][k + 1], String(q.rooms.reduce((s, r) => s + (r.points[c] ?? 0), 0)))));
    const fit = T.fittings(doc);
    if (fit && q.fittings.length) {
      if (fit.rows.length - 1 !== q.fittings.length) throw new Error("The lighting key doesn't have the right number of rows yet.");
      q.fittings.forEach((f, i) => edits.push(...setCell(fit.rows[i + 1][0], clean(f.ref)), ...setCell(fit.rows[i + 1][1], clean(f.fitting)), ...setCell(fit.rows[i + 1][2], clean(f.notes) || "–")));
    }
  }
  return toBatch(edits);
}

/** Reads the look of a body row in each striped table, so new rows can be given it. */
export function captureLongStyles(doc: Doc) {
  const styleOf = (t: FoundTable | null, row: number) => (t ? t.rows[row]?.map((c) => c[0]?.paragraph.elements?.[0]?.textRun?.textStyle ?? {}) ?? [] : []);
  return {
    scope: styleOf(T.scope(doc), 1),
    investment: styleOf(T.investment(doc), 1),
    extras: styleOf(T.extras(doc), 1),
    programme: styleOf(T.programme(doc), 1),
    points: styleOf(T.points(doc), 2),
    fittings: styleOf(T.fittings(doc), 1),
  };
}
export type LongStyles = ReturnType<typeof captureLongStyles>;

/** Pass 3: stripes on every resized table (white, grey, white…), and body text looking like body text. */
export function longStylePass(doc: Doc, q: LongQuote, styles: LongStyles): Request[] {
  const out: Request[] = [];
  const stripe = (t: FoundTable, first: number, last: number, look: Record<string, unknown>[], shade = true) => {
    for (let r = first; r <= last; r++) {
      const cols = t.rows[r].length;
      if (shade) out.push({
        updateTableCellStyle: {
          tableRange: { tableCellLocation: { tableStartLocation: { index: t.start }, rowIndex: r, columnIndex: 0 }, rowSpan: 1, columnSpan: cols },
          tableCellStyle: { backgroundColor: { color: { rgbColor: STRIPE[(r - first) % 2] } } },
          fields: "backgroundColor",
        },
      });
      t.rows[r].forEach((cell, c) => {
        const p = cell[0];
        const style = look[c] ?? {};
        if (!p || p.end - 1 <= p.start || Object.keys(style).length === 0) return;
        out.push({ updateTextStyle: { range: { startIndex: p.start, endIndex: p.end - 1 }, textStyle: style, fields: Object.keys(style).join(",") } });
      });
    }
  };
  const scope = T.scope(doc);
  stripe(scope, 1, scope.rows.length - 1, styles.scope);
  const inv = T.investment(doc);
  stripe(inv, 1, inv.rows.length - 1, styles.investment);
  const ex = T.extras(doc);
  stripe(ex, 1, ex.rows.length - 1, styles.extras);
  const prog = T.programme(doc);
  stripe(prog, 1, prog.rows.length - 1, styles.programme);
  if (q.rooms.length) {
    const pts = T.points(doc);
    // The point schedule's room rows are plain white in the template, so only the text is styled.
    if (pts) stripe(pts, 1, pts.rows.length - 2, styles.points, false);
    const fit = T.fittings(doc);
    if (fit && q.fittings.length) stripe(fit, 1, fit.rows.length - 1, styles.fittings);
  }
  return out;
}
