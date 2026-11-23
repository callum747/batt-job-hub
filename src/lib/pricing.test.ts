import { describe, expect, it } from "vitest";
import { buildLines, buildWrites, parsePriceList, parseProfit, pricingLight, validatePricing, type PricingInput } from "./pricing";

// Rows as the real "Product Price List" tab returns them (columns B to L), odd spacing included.
const LIST = [
  ["Lighting "],
  ["Product Name ", "Brand / Range", "Finish ", "Item Description ", "Accessory Price", "Additional Material Costs", "Total Materials Price", "Labour hours (per item)", "", "Previous labour allowance (£)"],
  ["Pendant ", "MK", "White Plastic ", "-", 4.15, 8.5, 12.65, 0.8, "", 25, "Pendant  | MK | White Plastic "],
  ["Wall Light (replace)", "-", "-", "Replaced", 0, 0, 0, 0.96, "", 30, "Wall Light (replace) | - | -"],
  [],
  ["-", "", "", "", "", "", "", "", "", "", "- |  | "],
  ["Power & Data", "", "", "", "", "", "", "", "", "", "Power & Data |  | "],
  ["Double socket", "Click", "White Plastic", "-", 16, 8.5, 24.5, 0.96, "", 30, "Double socket | Click | White Plastic"],
  ["Certification", "", "", "", 0, 0, 0, 2, "", 0, "Certification |  | "],
];

// What the real Profit tab gave for 8 x "Double socket | Click | White Plastic" (checked 22/11/2026).
const PROFIT = [
  ["Labour hours", 7.68], ["Labour days", 0.96], ["Materials cost, after discount (£)", 176.4], ["Labour sell (£)", 341.4336], ["Materials sell (£)", 202.86], [],
  ["Prelims and job extras (at cost)", "Value"], ["Round-trip miles to site", 0], ["People on site per day", 2], ["Vans travelling per day", 1], ["Site days", 0.48],
  ["Travel and mileage (£)", 0], ["Parking and congestion charges (£)", ""], ["Waste disposal (£)", ""], ["Access equipment hire (£)", ""], ["Other (£)", ""],
  ["Prelims cost (£)", 0], ["Prelims sell (£)", 0], [], ["Price", "Value"], ["Price before minimum charge (£)", 544.2936], ["Minimum charge (£)", 220.64],
  ["Price before discount, ex VAT (£)", 544.2936], ["Discount (optional)", 0], ["Sell price, ex VAT (£)", 544.2936], ["VAT (£)", 108.85872], ["Sell price, inc VAT (£)", 653.15232], [],
  ["Profit check", "Value"], ["Labour cost at break-even (£)", 260.24], ["Materials cost (£)", 176.4], ["Prelims cost (£)", 0], ["Total job cost (£)", 436.64],
  ["Net profit (£)", 107.6536], ["Net margin", 0.19779], ["Target net margin", 0.18], ["Status", "On or above target"],
];

const sockets: PricingInput = {
  items: [{ area: "Kitchen", key: "Double socket | Click | White Plastic", description: "Double socket", qty: 8 }],
  miles: 0, people: 2, vans: 1, parking: 0, waste: 0, access: 0, other: 0, oneElectrician: false,
};

describe("price list", () => {
  const list = parsePriceList(LIST);
  it("keeps the key exactly as the sheet has it, odd spacing and all", () => {
    expect(list.map((p) => p.key)).toEqual(["Pendant  | MK | White Plastic ", "Wall Light (replace) | - | -", "Double socket | Click | White Plastic", "Certification |  | "]);
  });
  it("gives each a tidy label and its section", () => {
    expect(list[0]).toMatchObject({ label: "Pendant | MK | White Plastic", section: "Lighting", materials: 12.65, hours: 0.8 });
    expect(list[1].label).toBe("Wall Light (replace)");
    expect(list[2].section).toBe("Power & Data");
    expect(list[3].label).toBe("Certification");
  });
  it("skips headings, dividers and blank rows", () => expect(list).toHaveLength(4));
});

describe("writing the sheet", () => {
  it("writes only B, C and D for price list items", () => {
    const w = buildWrites(sockets);
    expect(w[0]).toEqual({ range: "'Job Pricing'!B5:D5", values: [["Kitchen", "Double socket | Click | White Plastic", 8]] });
    expect(w.map((x) => x.range)).toEqual(["'Job Pricing'!B5:D5", "Profit!C12:C14", "Profit!C17:C20"]);
  });
  it("tells the sheet the electrician and apprentice mix when it's known", () => {
    expect(buildWrites({ ...sockets, apprenticeShare: 8 / 17 }).at(-1)).toEqual({ range: "Rates!C9", values: [[8 / 17]] });
    expect(buildWrites({ ...sockets, apprenticeShare: 0.5, oneElectrician: true }).at(-1)).toEqual({ range: "Rates!C9", values: [[0]] });
    expect(buildWrites(sockets).some((w) => w.range === "Rates!C9")).toBe(false);
  });
  it("never writes column F, or any formula column", () => {
    const w = buildWrites({ ...sockets, items: [...sockets.items, { area: "", key: null, description: "Special isolator", qty: 2, materialEach: 45, hoursEach: 1.5 }] });
    const cols = w.filter((x) => x.range.startsWith("'Job Pricing'")).map((x) => x.range.split("!")[1]);
    expect(cols).toEqual(["B5:D6", "E6", "G6"]);
    expect(w.find((x) => x.range.endsWith("!E6"))!.values).toEqual([[45]]);
    expect(w.find((x) => x.range.endsWith("!G6"))!.values).toEqual([[1.5]]);
  });
  it("puts miles, people, vans and extras in the Profit cells from the brief", () => {
    const w = buildWrites({ ...sockets, miles: 40, people: 1, vans: 1, parking: 18, waste: 25, access: 0, other: 5 });
    expect(w.find((x) => x.range === "Profit!C12:C14")!.values).toEqual([[40], [1], [1]]);
    expect(w.find((x) => x.range === "Profit!C17:C20")!.values).toEqual([[18], [25], [0], [5]]);
  });
  it("sets the apprentice share to 0 only for a one-electrician job", () => {
    expect(buildWrites(sockets).some((x) => x.range === "Rates!C9")).toBe(false);
    expect(buildWrites({ ...sockets, oneElectrician: true }).find((x) => x.range === "Rates!C9")!.values).toEqual([[0]]);
  });
});

describe("reading the answers", () => {
  it("reads 8 double sockets as £544.29, the brief's real check", () => {
    const r = parseProfit(PROFIT);
    expect(r.sellExVat).toBe(544.29);
    expect(r.vat).toBe(108.86);
    expect(r.sellIncVat).toBe(653.15);
    expect(r.materialsSell).toBe(202.86);
    expect(r.prelimsSell).toBe(0);
    expect(r.netProfit).toBe(107.65);
    expect(r.netMargin).toBe(19.8);
    expect(r.targetMargin).toBe(18);
  });
  it("fails loudly if the template has lost a line", () => {
    expect(() => parseProfit(PROFIT.filter((r) => r[0] !== "Net margin"))).toThrow(/Net margin/);
  });
  it("fails loudly on an error value", () => {
    expect(() => parseProfit(PROFIT.map((r) => (r[0] === "VAT (£)" ? ["VAT (£)", "#REF!"] : r)))).toThrow(/isn't a number/);
  });
});

describe("quote lines", () => {
  const row = ["Kitchen", "Double socket | Click | White Plastic", 8, 22.05, 176.4, 0.96, "Easy", 1, 7.68, 341.4336, 202.86, 544.2936];
  it("makes one line per item that adds up to the sheet's price", () => {
    const lines = buildLines(sockets, [row], parseProfit(PROFIT), 0.45);
    expect(lines).toEqual([{ kind: "item", description: "Double socket", detail: "Kitchen", qty: 8, rate: 68.04, cost: 202.86, amount: 544.29 }]);
  });
  it("adds travel and site costs, and still adds up", () => {
    const profit = PROFIT.map((r) => (r[0] === "Prelims sell (£)" ? [r[0], 20.7] : r[0] === "Sell price, ex VAT (£)" ? [r[0], 564.9936] : r));
    const lines = buildLines({ ...sockets, miles: 40 }, [row], parseProfit(profit), 0.45);
    expect(lines[1]).toMatchObject({ kind: "prelims", detail: "40 miles round trip at 45p a mile", amount: 20.7 });
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(564.99, 2);
  });
  it("shows the minimum charge when a small job is lifted to it", () => {
    const profit = PROFIT.map((r) => (r[0] === "Price before minimum charge (£)" ? [r[0], 48.66] : r[0] === "Sell price, ex VAT (£)" ? [r[0], 220.64] : r));
    const small = ["", "Pendant  | MK | White Plastic ", 1, 11.39, 11.39, 0.8, "Easy", 1, 0.8, 35.57, 13.09, 48.66];
    const lines = buildLines({ ...sockets, items: [{ area: "", key: "Pendant  | MK | White Plastic ", description: "Pendant", qty: 1 }] }, [small], parseProfit(profit), 0.45);
    expect(lines.map((l) => [l.kind, l.amount])).toEqual([["item", 48.66], ["minimum", 171.98]]);
  });
  it("fails loudly, naming the line, when the sheet couldn't price it", () => {
    const bad = ["Kitchen", "Double socket | Clik | White", 8, "#N/A", "#N/A", "#N/A", "Easy", 1, "#N/A", "#N/A", "#N/A", "#N/A"];
    expect(() => buildLines(sockets, [bad], parseProfit(PROFIT), 0.45)).toThrow(/line 1/);
  });
  it("refuses lines that don't add up to the sheet's price", () => {
    const profit = PROFIT.map((r) => (r[0] === "Sell price, ex VAT (£)" ? [r[0], 600] : r));
    expect(() => buildLines(sockets, [row], parseProfit(profit), 0.45)).toThrow(/add up/);
  });
});

describe("checking what was typed", () => {
  const list = parsePriceList(LIST);
  it("accepts a good pricing", () => expect(validatePricing(sockets, list)).toEqual([]));
  it("never lets an off-list item through without a cost and hours", () => {
    const p = validatePricing({ ...sockets, items: [{ area: "", key: null, description: "Special isolator", qty: 1 }] }, list);
    expect(p.join(" ")).toMatch(/material cost each/);
    expect(p.join(" ")).toMatch(/labour hours each/);
  });
  it("wants real miles, not a blank", () => expect(validatePricing({ ...sockets, miles: NaN }, list).join(" ")).toMatch(/exact round-trip/));
  it("catches a product that's gone from the list", () => {
    expect(validatePricing({ ...sockets, items: [{ ...sockets.items[0], key: "Old thing | x | y" }] }, list).join(" ")).toMatch(/isn't on the price list/);
  });
});

describe("margin light", () => {
  it("is green on or above the sheet's target", () => expect(pricingLight({ netMargin: 19.8, targetMargin: 18 }, 5)).toBe("green"));
  it("is amber below target", () => expect(pricingLight({ netMargin: 12, targetMargin: 18 }, 5)).toBe("amber"));
  it("is red below the red level", () => expect(pricingLight({ netMargin: 3, targetMargin: 18 }, 5)).toBe("red"));
});
