import { describe, expect, it } from "vitest";
import {
  allText, findTable, findTableByCell, leftoverPlaceholders, money, paragraphs, pdfPageCount, replaceInParagraph,
  replaceRange, resizeRows, setCell, setParagraph, tables, toBatch, type Block, type Doc, type Request,
} from "./docs";

/** Builds a document like Google returns, working out every position, so tests can check edits for real. */
function build(parts: (string | string[][])[]): Doc {
  let i = 1;
  const para = (text: string): Block => {
    const start = i;
    i += text.length + 1;
    return { startIndex: start, endIndex: i, paragraph: { elements: [{ startIndex: start, endIndex: i, textRun: { content: text + "\n" } }] } };
  };
  const content: Block[] = parts.map((p) => {
    if (typeof p === "string") return para(p);
    const start = i;
    i += 1; // table start
    const tableRows = p.map((row) => {
      const rs = i;
      i += 1; // row start
      const tableCells = row.map((cell) => {
        const cs = i;
        i += 1; // cell start
        const inner = cell.split("\n").map(para);
        return { startIndex: cs, endIndex: i, content: inner };
      });
      return { startIndex: rs, endIndex: i, tableCells };
    });
    i += 1; // table end
    return { startIndex: start, endIndex: i, table: { rows: p.length, columns: p[0].length, tableRows } };
  });
  return { body: { content } };
}

/** Applies text edits to a flat string the way Google would, to prove the positions are right. */
function apply(doc: Doc, requests: Request[]): string {
  // Lay the document out as characters at their real positions.
  const chars: string[] = [];
  const place = (blocks: Block[] = []) => {
    for (const b of blocks) {
      if (b.paragraph) [...b.paragraph.elements![0].textRun!.content!].forEach((ch, k) => (chars[b.startIndex! + k] = ch));
      else if (b.table) for (const r of b.table.tableRows!) for (const c of r.tableCells!) place(c.content);
    }
  };
  place(doc.body!.content);
  for (let k = 0; k < chars.length; k++) if (chars[k] === undefined) chars[k] = "§"; // structure markers
  for (const r of requests) {
    const ins = r.insertText as { location: { index: number }; text: string } | undefined;
    const del = r.deleteContentRange as { range: { startIndex: number; endIndex: number } } | undefined;
    if (ins) chars.splice(ins.location.index, 0, ...ins.text);
    if (del) chars.splice(del.range.startIndex, del.range.endIndex - del.range.startIndex);
  }
  return chars.join("").replace(/§/g, "");
}

const doc = build([
  "Quote Q-[000] for [Client name]",
  "Date: [DD/MM/YYYY]   Valid until: [DD/MM/YYYY]",
  [["Item", "Ref", "Works"], ["[ROOM / AREA]", "", ""], ["1", "[Ref]", "[Works]"], ["2", "[Ref]", "[Works]"]],
  "Between the tables",
  [["", "Subtotal", "£[0.00]"], ["", "VAT @ 20%", "£[0.00]"], ["", "Total (inc VAT)", "£[0.00]"]],
  "Kind regards",
]);

describe("reading a document", () => {
  it("lists every paragraph, inside tables too", () => {
    expect(paragraphs(doc.body!.content).map((p) => p.text.trim())).toContain("[ROOM / AREA]");
    expect(allText(doc)).toContain("Kind regards");
  });
  it("finds a table by its header row, ignoring case and spacing", () => {
    expect(findTable(doc, ["item", "REF", " works "])!.rows).toHaveLength(4);
    expect(findTable(doc, ["Section", "Description"])).toBeNull();
  });
  it("finds the totals table by the Subtotal label in the middle column", () => {
    const t = findTableByCell(doc, "Subtotal", 1)!;
    expect(t.rows).toHaveLength(3);
    expect(t).not.toBe(tables(doc.body!.content)[0]);
  });
  it("spots every placeholder left behind", () => {
    expect(leftoverPlaceholders(doc)).toEqual(expect.arrayContaining(["[000]", "[Client name]", "[DD/MM/YYYY]", "[ROOM / AREA]", "[0.00]"]));
    expect(leftoverPlaceholders(build(["All done", [["a", "b"]]]))).toEqual([]);
  });
  it("counts an unclosed bracket as a leftover too", () => {
    expect(leftoverPlaceholders(build(["Price [TBC"]))).toEqual(["[TBC"]);
  });
});

describe("writing text", () => {
  it("allows for an image at the start of a paragraph (a heading's blue bar takes up one position)", () => {
    // "￼  Invoice INV-[000]" from the invoice template: the image is at 1, the text starts at 2.
    const p = { start: 1, end: 22, text: "  Invoice INV-[000]\n", paragraph: { elements: [{ startIndex: 1, endIndex: 2, inlineObjectElement: {} }, { startIndex: 2, endIndex: 22, textRun: { content: "  Invoice INV-[000]\n" } }] } };
    const e = replaceInParagraph(p, "INV-[000]", "INV-546")!;
    expect(e.at).toBe(12);
    expect(e.requests).toEqual(replaceRange(12, 21, "INV-546"));
  });
  it("replaces a whole paragraph", () => {
    const p = paragraphs(doc.body!.content).find((x) => x.text.startsWith("Between"))!;
    expect(apply(doc, toBatch([setParagraph(p, "New words")]))).toContain("\nNew words\n");
  });
  it("can tell two identical placeholders apart: first is the date, second is valid-until", () => {
    const p = paragraphs(doc.body!.content)[1];
    const out = apply(doc, toBatch([replaceInParagraph(p, "[DD/MM/YYYY]", "23/11/2026", 0)]));
    expect(out).toContain("Date: 23/11/2026   Valid until: [DD/MM/YYYY]");
    const out2 = apply(doc, toBatch([replaceInParagraph(p, "[DD/MM/YYYY]", "23/12/2026", 1)]));
    expect(out2).toContain("Date: [DD/MM/YYYY]   Valid until: 23/12/2026");
  });
  it("applies many edits in one go, from the end backwards, without positions drifting", () => {
    const ps = paragraphs(doc.body!.content);
    const items = findTable(doc, ["Item", "Ref", "Works"])!;
    const totals = findTableByCell(doc, "Subtotal", 1)!;
    const out = apply(
      doc,
      toBatch([
        replaceInParagraph(ps[0], "Q-[000]", "557"),
        // two edits in one paragraph are separate edits at different places
        replaceInParagraph(ps[0], "[Client name]", "Meterz"),
        ...setCell(items.rows[1][0], "KITCHEN"),
        ...setCell(items.rows[2][1], "DS1"),
        ...setCell(items.rows[2][2], "8 double sockets"),
        ...setCell(items.rows[3][1], "C1"),
        ...setCell(items.rows[3][2], "New radial circuit, a longer line than the placeholder was"),
        ...setCell(totals.rows[0][2], money(735.76)),
        ...setCell(totals.rows[1][2], money(147.15)),
        ...setCell(totals.rows[2][2], money(882.91)),
      ]),
    );
    expect(out).toBe(
      "\u0000Quote 557 for Meterz\nDate: [DD/MM/YYYY]   Valid until: [DD/MM/YYYY]\nItem\nRef\nWorks\nKITCHEN\n\n\n1\nDS1\n8 double sockets\n2\nC1\nNew radial circuit, a longer line than the placeholder was\nBetween the tables\n\nSubtotal\n£735.76\n\nVAT @ 20%\n£147.15\n\nTotal (inc VAT)\n£882.91\nKind regards\n".slice(1),
    );
  });
  it("refuses two edits at the same position", () => {
    const p = paragraphs(doc.body!.content)[3];
    expect(() => toBatch([setParagraph(p, "a"), setParagraph(p, "b")])).toThrow(/same place/);
  });
  it("keeps the old text's styling by inserting after its first character", () => {
    expect(replaceRange(10, 15, "Hi")).toEqual([
      { insertText: { location: { index: 11 }, text: "Hi" } },
      { deleteContentRange: { range: { startIndex: 13, endIndex: 17 } } },
      { deleteContentRange: { range: { startIndex: 10, endIndex: 11 } } },
    ]);
  });
  it("fills an empty cell and clears a filled one", () => {
    const items = findTable(doc, ["Item", "Ref", "Works"])!;
    expect(apply(doc, toBatch(setCell(items.rows[1][1], "X")))).toContain("[ROOM / AREA]\nX\n");
    expect(apply(doc, toBatch(setCell(items.rows[2][1], "")))).toContain("1\n\n[Works]");
  });
});

describe("table rows", () => {
  const items = findTable(doc, ["Item", "Ref", "Works"])!;
  it("adds rows below the last body row so they copy its formatting", () => {
    const e = resizeRows(items, 2, 3, 4)!;
    expect(e.requests).toEqual([
      { insertTableRow: { tableCellLocation: { tableStartLocation: { index: items.start }, rowIndex: 3, columnIndex: 0 }, insertBelow: true } },
      { insertTableRow: { tableCellLocation: { tableStartLocation: { index: items.start }, rowIndex: 3, columnIndex: 0 }, insertBelow: true } },
    ]);
  });
  it("removes spare rows from the bottom up", () => {
    expect(resizeRows(items, 1, 3, 1)!.requests).toEqual([
      { deleteTableRow: { tableCellLocation: { tableStartLocation: { index: items.start }, rowIndex: 3, columnIndex: 0 } } },
      { deleteTableRow: { tableCellLocation: { tableStartLocation: { index: items.start }, rowIndex: 2, columnIndex: 0 } } },
    ]);
  });
  it("does nothing when the table is already the right length", () => expect(resizeRows(items, 2, 3, 2)).toBeNull());
});

describe("helpers", () => {
  it("formats money for a document", () => expect(money(16175.6)).toBe("£16,175.60"));
  it("counts PDF pages", () => {
    const pdf = "%PDF-1.4\n1 0 obj << /Type /Pages /Count 2 >> endobj\n2 0 obj << /Type /Page /Parent 1 0 R >> endobj\n3 0 obj <</Type/Page/Parent 1 0 R>> endobj";
    expect(pdfPageCount(new TextEncoder().encode(pdf))).toBe(2);
  });
});
