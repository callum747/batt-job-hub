/**
 * Tools for filling Google Docs templates. Pure functions over the JSON that Google's
 * documents.get returns; they produce the list of edits to send back. Tested.
 *
 * Lessons from the brief, section 8:
 *  - Change table row counts first, re-read the document, then write text.
 *  - Write text from the end of the document backwards, so earlier positions stay valid.
 *  - Afterwards, look for any "[" left behind and fail loudly.
 */

export type TextRun = { content?: string; textStyle?: Record<string, unknown> };
export type Element = { startIndex?: number; endIndex?: number; textRun?: TextRun; inlineObjectElement?: unknown; pageBreak?: unknown };
export type Paragraph = { elements?: Element[]; paragraphStyle?: { namedStyleType?: string }; bullet?: unknown };
export type TableCell = { startIndex?: number; endIndex?: number; content?: Block[]; tableCellStyle?: { columnSpan?: number; rowSpan?: number } };
export type TableRow = { startIndex?: number; endIndex?: number; tableCells?: TableCell[] };
export type Table = { rows?: number; columns?: number; tableRows?: TableRow[] };
export type Block = { startIndex?: number; endIndex?: number; paragraph?: Paragraph; table?: Table; sectionBreak?: unknown };
export type Doc = {
  documentId?: string;
  body?: { content?: Block[] };
  headers?: Record<string, { content?: Block[] }>;
  footers?: Record<string, { content?: Block[] }>;
  footnotes?: Record<string, { content?: Block[] }>;
};
export type Request = Record<string, unknown>;

export type Para = { start: number; end: number; text: string; paragraph: Paragraph };
export type FoundTable = { start: number; block: Block; table: Table; rows: Para[][][] };

export const paragraphText = (p: Paragraph) => (p.elements ?? []).map((e) => e.textRun?.content ?? "").join("");

function toPara(b: Block): Para {
  return { start: b.startIndex ?? 0, end: b.endIndex ?? 0, text: paragraphText(b.paragraph!), paragraph: b.paragraph! };
}

/** Every paragraph in a list of blocks, in order, going into tables (and tables inside cells). */
export function paragraphs(content: Block[] = []): Para[] {
  const out: Para[] = [];
  for (const b of content) {
    if (b.paragraph) out.push(toPara(b));
    else if (b.table) for (const r of b.table.tableRows ?? []) for (const c of r.tableCells ?? []) out.push(...paragraphs(c.content));
  }
  return out;
}

/** Every table, outermost first, including tables nested inside cells. */
export function tables(content: Block[] = []): FoundTable[] {
  const out: FoundTable[] = [];
  for (const b of content) {
    if (!b.table) continue;
    out.push({
      start: b.startIndex ?? 0,
      block: b,
      table: b.table,
      rows: (b.table.tableRows ?? []).map((r) => (r.tableCells ?? []).map((c) => (c.content ?? []).filter((x) => x.paragraph).map(toPara))),
    });
    for (const r of b.table.tableRows ?? []) for (const c of r.tableCells ?? []) out.push(...tables(c.content));
  }
  return out;
}

const norm = (s: string) => s.replace(/[\s \u000b]+/g, " ").trim().toLowerCase();
export const cellText = (cell: Para[]) => cell.map((p) => p.text).join("").replace(/\n$/, "");

/** The first table whose header row starts with these column titles (case and spacing ignored). */
export function findTable(doc: Doc, headers: string[], nth = 0): FoundTable | null {
  const want = headers.map(norm);
  const hits = tables(doc.body?.content).filter((t) => {
    const first = (t.rows[0] ?? []).map((c) => norm(cellText(c)));
    return want.every((h, i) => first[i] === h);
  });
  return hits[nth] ?? null;
}

/** A table that has a row whose given column reads as the label (e.g. the totals table with "Subtotal"). */
export function findTableByCell(doc: Doc, label: string, column?: number): FoundTable | null {
  const want = norm(label);
  return (
    tables(doc.body?.content).find((t) => t.rows.some((r) => r.some((c, i) => (column === undefined || i === column) && norm(cellText(c)) === want))) ?? null
  );
}

/** All the text a reader could see: body, headers, footers and footnotes. */
export function allText(doc: Doc): string {
  const parts = [doc.body?.content, ...Object.values(doc.headers ?? {}).map((h) => h.content), ...Object.values(doc.footers ?? {}).map((h) => h.content), ...Object.values(doc.footnotes ?? {}).map((h) => h.content)];
  return parts.map((c) => paragraphs(c).map((p) => p.text).join("")).join("\n");
}

/** Anything still in square brackets. An empty list means the document is clean. */
export function leftoverPlaceholders(doc: Doc): string[] {
  const text = allText(doc);
  const found = text.match(/\[[^\]\n]{0,80}\]?/g) ?? [];
  return [...new Set(found.map((s) => s.trim()))];
}

/**
 * Replaces a stretch of text, keeping its styling. The new text goes in just after the first old
 * character (so it takes that character's style), then the old text is removed around it.
 * `start`/`end` are document positions of the old text (end exclusive, not including the newline).
 */
export function replaceRange(start: number, end: number, text: string): Request[] {
  if (end <= start) return text ? [{ insertText: { location: { index: start }, text } }] : [];
  if (!text) return [{ deleteContentRange: { range: { startIndex: start, endIndex: end } } }];
  const reqs: Request[] = [{ insertText: { location: { index: start + 1 }, text } }];
  if (end - start > 1) reqs.push({ deleteContentRange: { range: { startIndex: start + 1 + text.length, endIndex: end + text.length } } });
  reqs.push({ deleteContentRange: { range: { startIndex: start, endIndex: start + 1 } } });
  return reqs;
}

export type Edit = { at: number; requests: Request[] };

/** Replaces all of a paragraph's text (not its final newline). */
export function setParagraph(p: Para, text: string): Edit {
  const hasNewline = p.text.endsWith("\n");
  return { at: p.start, requests: replaceRange(p.start, hasNewline ? p.end - 1 : p.end, text) };
}

/** Replaces the nth occurrence of `find` inside a paragraph, leaving the rest alone. Null if it isn't there. */
export function replaceInParagraph(p: Para, find: string, text: string, nth = 0): Edit | null {
  let from = -1;
  for (let i = 0; i <= nth; i++) {
    from = p.text.indexOf(find, from + 1);
    if (from === -1) return null;
  }
  const start = p.start + utf16Offset(p, from);
  return { at: start, requests: replaceRange(start, start + find.length, text) };
}

// Paragraph elements are contiguous, so an offset into the joined text is an offset from the paragraph start.
function utf16Offset(_p: Para, offset: number) {
  return offset;
}

/** Sets a cell's text: the first paragraph gets the text and any further paragraphs in the cell are emptied. */
export function setCell(cell: Para[], text: string): Edit[] {
  if (cell.length === 0) return [];
  return [setParagraph(cell[0], text), ...cell.slice(1).filter((p) => p.text.replace(/\n$/, "") !== "").map((p) => setParagraph(p, ""))];
}

/** Orders edits from the end of the document backwards and flattens them into one batch. */
export function toBatch(edits: (Edit | null)[]): Request[] {
  const real = edits.filter((e): e is Edit => e !== null && e.requests.length > 0);
  const seen = new Set<number>();
  for (const e of real) {
    if (seen.has(e.at)) throw new Error(`Two edits target the same place in the document (position ${e.at}).`);
    seen.add(e.at);
  }
  return real.sort((a, b) => b.at - a.at).flatMap((e) => e.requests);
}

/**
 * Makes a table's body the right length. `first` and `last` are the row numbers (0-based) of the
 * existing body rows; the result has `want` body rows. New rows are added below the last body row
 * so they copy its formatting; spare rows are removed from the bottom of the body up.
 */
export function resizeRows(table: FoundTable, first: number, last: number, want: number): Edit | null {
  const have = last - first + 1;
  if (want < 1) throw new Error("A table needs at least one row.");
  if (want === have) return null;
  const tableStartLocation = { index: table.start };
  const requests: Request[] = [];
  if (want > have) {
    for (let i = 0; i < want - have; i++) {
      requests.push({ insertTableRow: { tableCellLocation: { tableStartLocation, rowIndex: last, columnIndex: 0 }, insertBelow: true } });
    }
  } else {
    for (let row = last; row > last - (have - want); row--) {
      requests.push({ deleteTableRow: { tableCellLocation: { tableStartLocation, rowIndex: row, columnIndex: 0 } } });
    }
  }
  return { at: table.start, requests };
}

/** Counts the pages in a PDF, without needing a PDF library. */
export function pdfPageCount(bytes: Uint8Array): number {
  const text = Buffer.from(bytes).toString("latin1");
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

/** £1,234.50 */
export const money = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type GroupStyles = { group: Record<string, unknown>[]; item: Record<string, unknown>[] };

/** How a group header row (e.g. a room or site) and an item row look, read from an untouched template. */
export function captureGroupStyles(table: FoundTable, groupRow: number, itemRow: number): GroupStyles {
  const styleOf = (cell: Para[]) => cell[0]?.paragraph.elements?.[0]?.textRun?.textStyle ?? {};
  return { group: table.rows[groupRow].map(styleOf), item: table.rows[itemRow].map(styleOf) };
}

/** Gives each body row (from row 1) the group or item look, whatever row it was copied from. */
export function groupStylePass(table: FoundTable, kinds: ("group" | "item")[], styles: GroupStyles): Request[] {
  if (table.rows.length - 1 !== kinds.length) throw new Error("The table doesn't have the right number of rows.");
  const out: Request[] = [];
  kinds.forEach((kind, i) => {
    table.rows[i + 1].forEach((cell, c) => {
      const p = cell[0];
      if (!p || p.end - 1 <= p.start) return;
      const fields = [...new Set([...Object.keys(styles.group[c] ?? {}), ...Object.keys(styles.item[c] ?? {})])];
      if (fields.length === 0) return;
      out.push({ updateTextStyle: { range: { startIndex: p.start, endIndex: p.end - 1 }, textStyle: styles[kind][c] ?? {}, fields: fields.join(",") } });
    });
  });
  return out;
}
