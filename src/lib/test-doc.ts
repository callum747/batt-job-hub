/** Test helpers: build a Google Doc structure with real positions, and apply text edits to it like Google would. */
import type { Block, Doc, Request } from "./docs";

export type Part = string | { text: string; bullet?: boolean } | string[][];

export function buildDoc(parts: Part[]): Doc {
  let i = 1;
  const para = (text: string, bullet = false): Block => {
    const start = i;
    i += text.length + 1;
    return { startIndex: start, endIndex: i, paragraph: { elements: [{ startIndex: start, endIndex: i, textRun: { content: text + "\n", textStyle: {} } }], ...(bullet ? { bullet: { listId: "l" } } : {}) } };
  };
  const content: Block[] = parts.map((p) => {
    if (typeof p === "string") return para(p);
    if (!Array.isArray(p)) return para(p.text, p.bullet);
    const start = i;
    i += 1;
    const tableRows = p.map((row) => {
      const rs = i;
      i += 1;
      const tableCells = row.map((cell) => {
        const cs = i;
        i += 1;
        return { startIndex: cs, endIndex: i, content: cell.split("\n").map((t) => para(t)) };
      });
      return { startIndex: rs, endIndex: i, tableCells };
    });
    i += 1;
    return { startIndex: start, endIndex: i, table: { rows: p.length, columns: p[0].length, tableRows } };
  });
  return { body: { content } };
}

/** Lays the document out as characters at their real positions, applies text edits, and returns the text. */
export function applyText(doc: Doc, requests: Request[]): string {
  const chars: string[] = [];
  const place = (blocks: Block[] = []) => {
    for (const b of blocks) {
      if (b.paragraph) [...b.paragraph.elements![0].textRun!.content!].forEach((ch, k) => (chars[b.startIndex! + k] = ch));
      else if (b.table) for (const r of b.table.tableRows!) for (const c of r.tableCells!) place(c.content);
    }
  };
  place(doc.body!.content);
  for (let k = 0; k < chars.length; k++) if (chars[k] === undefined) chars[k] = "§";
  for (const r of requests) {
    const ins = r.insertText as { location: { index: number }; text: string } | undefined;
    const del = r.deleteContentRange as { range: { startIndex: number; endIndex: number } } | undefined;
    if (ins) chars.splice(ins.location.index, 0, ...ins.text);
    if (del) chars.splice(del.range.startIndex, del.range.endIndex - del.range.startIndex);
  }
  return chars.join("").replace(/§/g, "");
}
