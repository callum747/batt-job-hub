import { describe, expect, it } from "vitest";
import { leftoverPlaceholders } from "./docs";
import { captureRowStyles, checkShortQuote, locate, scheduleRows, structurePass, stylePass, textPass, type ShortQuote } from "./quote-short";
import { applyText, buildDoc, type Part } from "./test-doc";

/** The short-form template's layout, as read from the real template on 23/11/2026. */
function template(opts: { schedule?: string[][]; investment?: string[][]; stages?: string[][]; assumptions?: string[]; jobExclusion?: boolean } = {}): Part[] {
  const schedule = opts.schedule ?? [
    ["[ROOM / AREA]", "", ""], ["[Item]", "[Ref]", "[Works]"], ["[Item]", "[Ref]", "[Works]"],
    ["[ROOM / AREA]", "", ""], ["[Item]", "[Ref]", "[Works]"], ["[Item]", "[Ref]", "[Works]"],
    ["[ROOM / AREA]", "", ""], ["[Item]", "[Ref]", "[Works]"], ["[Item]", "[Ref]", "[Works]"],
  ];
  return [
    [["PROPOSAL REF\nQ-[000]"]],
    "PROJECT", "PROPOSAL", "POWERING PROFITABLE PROPERTY",
    "PREPARED FOR", "[Client name]", "[Project name]  |  [Site address, postcode]",
    [["REVISION\nA", "DATE\n[DD/MM/YYYY]", "VALID UNTIL\n[DD/MM/YYYY]", "PREPARED BY\nCameron Batt"]],
    "02   YOUR PROJECT", "  Project Summary",
    "[Two or three sentences: what the job is, where, and anything it follows on from (e.g. a previous quote or a designer’s brief).]",
    "[Describe the installation as a whole: cable types, containment, fittings and controls finish, how existing circuits are used, and testing and certification to BS 7671 with NAPIT certification on completion.]",
    "Room-by-room schedule (anything not listed is excluded)",
    [["Item", "Ref", "Works"], ...schedule],
    "03   YOUR INVESTMENT", "  Investment Summary",
    "Includes testing and certification. Any variations will be agreed in writing before work proceeds.",
    [["Section", "Description", "Subtotal ex VAT"], ...(opts.investment ?? [["[Main works]", "All works in the schedule, including materials", "£[0.00]"], ["[Access equipment / other]", "[Short description, or delete this row]", "£[0.00]"]])],
    "",
    [["", "Subtotal", "£[0.00]"], ["", "VAT @ 20%", "£[0.00]"], ["", "Total (inc VAT)", "£[0.00]"]],
    "  Payment Terms",
    [["Stage", "Amount"], ...(opts.stages ?? [["Deposit, on acceptance", "20%"], ["On completion", "80%"]])],
    "Payable by bank transfer, cheque or card within 7 days of invoice. Late payments may incur 5% after 7 days and 5% each further week.",
    "  Exclusions & Assumptions", "Exclusions",
    { text: "Builder’s work in connection (chasing, core drilling, making good, fire stopping and decoration) unless stated", bullet: true },
    { text: "Asbestos survey or removal", bullet: true },
    { text: "Remedial work to existing circuits or equipment not replaced under this scope", bullet: true },
    ...(opts.jobExclusion === false ? [] : [{ text: "[Job-specific exclusion]", bullet: true }]),
    "Assumptions",
    ...(opts.assumptions ?? ["[e.g. The existing supply and circuits have capacity for the proposed works]", "[e.g. Clear access to all work areas, with furniture and fragile items moved by the client before we arrive]"]).map((t) => ({ text: t, bullet: true })),
    "",
    "04   NEXT STEPS", "  Quote Acceptance",
    [["Thank you for the opportunity to quote for [project name]. If anything needs adjusting, or you would like to talk through the options, please get in touch. We look forward to working with you.\nCameron Batt   Managing Director, Batt Electrical  |  01296 321321  |  cameron@battelectrical.com"]],
    "By instructing Batt Electrical to carry out the works, you accept this quotation (Q-[000]), including the scope and price set out above, and agree to the Batt Electrical Terms & Conditions.",
    "A 20% deposit is required before works are scheduled. Once the deposit is received, we will order materials and confirm your start date. To go ahead, simply reply to this quotation or email info@battelectrical.com.",
    [["TERMS & CONDITIONS\nThis quotation is subject to the Batt Electrical Terms & Conditions.\nView our Terms & Conditions →"]],
  ];
}

const quote: ShortQuote = {
  number: 557,
  client: "Amit Tripathi",
  project: "Kitchen sockets and new radial circuit",
  site: "8 Alwin Close, Aylesbury, HP21 8RP",
  date: "23/11/2026",
  validUntil: "23/12/2026",
  preparedBy: { name: "Callum Blacknell", title: "Project Manager", email: "callum@battelectrical.com" },
  summary: "Supply and fit eight double sockets in the kitchen on a new radial circuit.",
  installation: "New circuit in 2.5mm² twin and earth from a spare way, clipped and concealed where possible, tested and certified to BS 7671 with NAPIT certification on completion.",
  schedule: [
    { area: "Kitchen", items: [{ item: "Double socket", ref: "8", works: "Supply and fit 8 double sockets, Click white plastic" }, { item: "Radial circuit", ref: "1", works: "New radial circuit from the consumer unit" }] },
  ],
  investment: [
    { section: "Kitchen", description: "8 double sockets", amount: 544.29 },
    { section: "Kitchen", description: "New radial circuit", amount: 177.65 },
    { section: "Travel", description: "40 miles round trip at 45p a mile", amount: 13.82 },
  ],
  subtotal: 735.76,
  vat: 147.15,
  total: 882.91,
  deposit: true,
  paymentDays: 7,
  exclusions: [],
  assumptions: ["The existing supply and circuits have capacity for the proposed works", "Clear access to the kitchen"],
};

/** The template after pass 1 has been applied (what Google would give back on the re-read). */
function afterStructure(q: ShortQuote) {
  const sched: string[][] = [];
  for (let i = 0; i < scheduleRows(q); i++) sched.push(["", "", ""]);
  return buildDoc(
    template({
      schedule: sched,
      investment: q.investment.map(() => ["", "", ""]),
      stages: q.deposit ? [["Deposit, on acceptance", "20%"], ["On completion", "80%"]] : [["Deposit, on acceptance", "20%"]],
      assumptions: ["[e.g. The existing supply and circuits have capacity for the proposed works]"],
      jobExclusion: q.exclusions.length > 0,
    }),
  );
}

describe("finding the template's parts", () => {
  it("finds everything in the real layout", () => {
    const l = locate(buildDoc(template()));
    expect(l.schedule.rows).toHaveLength(10);
    expect(l.investment.rows).toHaveLength(3);
    expect(l.assumptions).toHaveLength(2);
    expect(l.preparedBy.text).toBe("Cameron Batt\n");
  });
  it("fails loudly if the template changes", () => {
    const parts = template().filter((p) => p !== "[Client name]");
    expect(() => locate(buildDoc(parts))).toThrow(/\[Client name\]/);
  });
});

describe("pass 1: structure", () => {
  it("shrinks the schedule to 1 room + 2 items, the investment to 3 rows, and tidies assumptions", () => {
    const reqs = structurePass(buildDoc(template()), quote);
    const deletes = reqs.filter((r) => r.deleteTableRow).length;
    const inserts = reqs.filter((r) => r.insertTableRow).length;
    expect(deletes).toBe(6); // schedule 9 -> 3
    expect(inserts).toBe(1); // investment 2 -> 3
    const paraDeletes = reqs.filter((r) => r.deleteContentRange);
    expect(paraDeletes).toHaveLength(2); // [Job-specific exclusion] and the second assumption
  });
  it("sends structural changes from the end of the document backwards", () => {
    const reqs = structurePass(buildDoc(template()), quote);
    const at = reqs.map((r) => {
      const x = (r.deleteTableRow ?? r.insertTableRow) as { tableCellLocation: { tableStartLocation: { index: number } } } | undefined;
      return x ? x.tableCellLocation.tableStartLocation.index : (r.deleteContentRange as { range: { startIndex: number } }).range.startIndex;
    });
    expect([...at].sort((a, b) => b - a)).toEqual(at);
  });
  it("keeps the job-specific exclusion line when there are exclusions, and drops the deposit row when there's no deposit", () => {
    const reqs = structurePass(buildDoc(template()), { ...quote, exclusions: ["Moving the fridge"], deposit: false });
    expect(reqs.filter((r) => r.deleteContentRange)).toHaveLength(1);
    const stages = locate(buildDoc(template())).stages.start;
    expect(reqs.some((r) => (r.deleteTableRow as { tableCellLocation: { tableStartLocation: { index: number } } } | undefined)?.tableCellLocation.tableStartLocation.index === stages)).toBe(true);
  });
});

describe("pass 2: text", () => {
  const doc = afterStructure(quote);
  const out = applyText(doc, textPass(doc, quote));

  it("leaves no placeholder anywhere", () => {
    expect(out).not.toMatch(/\[/);
  });
  it("fills the cover", () => {
    expect(out).toContain("PROPOSAL REF\n557\n");
    expect(out).toContain("\nAmit Tripathi\nKitchen sockets and new radial circuit  |  8 Alwin Close, Aylesbury, HP21 8RP\n");
    expect(out).toContain("DATE\n23/11/2026\nVALID UNTIL\n23/12/2026\nPREPARED BY\nCallum Blacknell\n");
  });
  it("fills the schedule with the room in capitals", () => {
    expect(out).toContain("Item\nRef\nWorks\nKITCHEN\n\n\nDouble socket\n8\nSupply and fit 8 double sockets, Click white plastic\nRadial circuit\n1\nNew radial circuit from the consumer unit\n");
  });
  it("fills the investment and totals to the penny", () => {
    expect(out).toContain("Kitchen\n8 double sockets\n£544.29\nKitchen\nNew radial circuit\n£177.65\nTravel\n40 miles round trip at 45p a mile\n£13.82\n");
    expect(out).toContain("Subtotal\n£735.76\n\nVAT @ 20%\n£147.15\n\nTotal (inc VAT)\n£882.91\n");
  });
  it("signs it from whoever is preparing it", () => {
    expect(out).toContain("Callum Blacknell   Project Manager, Batt Electrical  |  01296 321321  |  callum@battelectrical.com");
    expect(out).not.toContain("Cameron");
    expect(out).toContain("accept this quotation (557),");
    expect(out).toContain("quote for Kitchen sockets and new radial circuit.");
  });
  it("lists the assumptions as separate lines", () => {
    expect(out).toContain("Assumptions\nThe existing supply and circuits have capacity for the proposed works\nClear access to the kitchen\n");
  });
  it("keeps the template's 20% deposit and 7 days by default", () => {
    expect(out).toContain("Deposit, on acceptance\n20%\nOn completion\n80%");
    expect(out).toContain("within 7 days of invoice");
    expect(out).toContain("A 20% deposit is required");
  });
  it("handles no deposit and 30-day terms (Meterz)", () => {
    const q = { ...quote, deposit: false, paymentDays: 30, exclusions: ["Gas and heating works, by others", "Parking"] };
    const d = afterStructure(q);
    const o = applyText(d, textPass(d, q));
    expect(o).toContain("Stage\nAmount\nOn completion\n100%\n");
    expect(o).toContain("within 30 days of invoice. Late payments may incur 5% after 7 days");
    expect(o).toContain("No deposit is needed.");
    expect(o).not.toContain("20% deposit");
    expect(o).toContain("not replaced under this scope\nGas and heating works, by others\nParking\nAssumptions");
    expect(o).not.toMatch(/\[/);
  });
  it("refuses to fill before the structure pass has run", () => {
    expect(() => textPass(buildDoc(template()), quote)).toThrow(/right number of rows/);
  });
});

describe("pass 3: style", () => {
  const raw = buildDoc(template());
  // Give the template's room and item rows different looks, as the real one has.
  const t = locate(raw).schedule;
  t.rows[1][0][0].paragraph.elements![0].textRun!.textStyle = { bold: true, foregroundColor: { color: { rgbColor: { red: 0.15 } } } };
  t.rows[2][0][0].paragraph.elements![0].textRun!.textStyle = { fontSize: { magnitude: 9, unit: "PT" } };
  const styles = captureRowStyles(raw);
  const filled = buildDoc(template({ schedule: [["KITCHEN", "", ""], ["Double socket", "8", "Fit"], ["Radial circuit", "1", "New"]] }));

  it("styles room rows like rooms and item rows like items, clearing the other look", () => {
    const reqs = stylePass(filled, quote, styles) as { updateTextStyle: { range: { startIndex: number; endIndex: number }; textStyle: object; fields: string } }[];
    const room = reqs[0].updateTextStyle;
    expect(room.textStyle).toEqual({ bold: true, foregroundColor: { color: { rgbColor: { red: 0.15 } } } });
    expect(room.fields).toBe("bold,foregroundColor,fontSize");
    expect(reqs.slice(1).every((r) => !("bold" in r.updateTextStyle.textStyle))).toBe(true);
    // Only the first column differs between room and item rows in this sample, so one change per row.
    expect(reqs).toHaveLength(3);
  });
  it("works on the filled document, after every placeholder is gone", () => {
    const d = afterStructure(quote);
    const filledText = applyText(d, textPass(d, quote));
    // Rebuild the filled document from its text to get fresh positions, as Google's re-read would.
    const lines = filledText.split("\n");
    const schedStart = lines.indexOf("Works") + 1;
    const rows: string[][] = [];
    for (let k = 0; k < scheduleRows(quote); k++) rows.push(lines.slice(schedStart + k * 3, schedStart + k * 3 + 3));
    const filledDoc = buildDoc(template({ schedule: rows, assumptions: ["x"] }).map((p) => (p === "[Client name]" ? "Amit Tripathi" : p)));
    expect(() => stylePass(filledDoc, quote, styles)).not.toThrow();
    expect(stylePass(filledDoc, quote, styles).length).toBe(3);
  });
  it("covers just the text, not the paragraph end", () => {
    const sched = locate(filled).schedule;
    const r = (stylePass(filled, quote, styles)[0] as { updateTextStyle: { range: { startIndex: number; endIndex: number } } }).updateTextStyle.range;
    expect(r).toEqual({ startIndex: sched.rows[1][0][0].start, endIndex: sched.rows[1][0][0].start + "KITCHEN".length });
  });
});

describe("checking the content first", () => {
  it("accepts a good quote", () => expect(checkShortQuote(quote)).toEqual([]));
  it("catches square brackets typed in", () => expect(checkShortQuote({ ...quote, summary: "Fit [TBC] sockets" }).join(" ")).toMatch(/square brackets/));
  it("catches lines that don't add up", () => expect(checkShortQuote({ ...quote, subtotal: 700 }).join(" ")).toMatch(/add up/));
  it("catches wrong VAT", () => expect(checkShortQuote({ ...quote, vat: 140 }).join(" ")).toMatch(/VAT should be £147.15/));
  it("needs at least one assumption", () => expect(checkShortQuote({ ...quote, assumptions: [" "] }).join(" ")).toMatch(/assumption/));
  it("needs every schedule area to have items", () => expect(checkShortQuote({ ...quote, schedule: [{ area: "Hall", items: [] }] }).join(" ")).toMatch(/at least one item/));
});

describe("whole document check", () => {
  it("the filled document has no leftovers", () => {
    const d = afterStructure(quote);
    const text = applyText(d, textPass(d, quote));
    expect(leftoverPlaceholders(buildDoc(text.split("\n")))).toEqual([]);
  });
});
