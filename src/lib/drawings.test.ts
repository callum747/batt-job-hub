import { describe, expect, it } from "vitest";
import { countToItems, countTotals, looksElectrical, type DrawingCount } from "./drawings";

const products = [
  { key: "Double socket | Click | White Plastic", label: "Double socket | Click | White Plastic", section: "Power & Data", materials: 4, hours: 0.75 },
  { key: "Downlight | JCC | Fire rated", label: "Downlight | JCC | Fire rated", section: "Lighting", materials: 9, hours: 0.5 },
];
const item = (description: string, qty: number, key = "") => ({ description, qty, key, confidence: "high" as const, note: "" });
const count: DrawingCount = {
  drawings_read: ["81_001"], legend: [], not_counted: [], questions: [],
  rooms: [
    { floor: "Ground", room: "Kitchen", items: [item("Double socket", 6, products[0].key), item("Downlight", 8, products[1].key), item("Double socket", 2, products[0].key)] },
    { floor: "First", room: "First Floor Landing", items: [item("Downlight", 4, products[1].key), item("Towel rail spur", 1), item("Made-up product", 1, "Not | On | The list")] },
  ],
};

describe("drawing counts", () => {
  it("ticks the electrical drawings by name, not the rest", () => {
    expect(looksElectrical("81_001_Proposed Small Power & Lighting Layout_Ground (P01).pdf")).toBe(true);
    expect(looksElectrical("E-101 Lighting.pdf")).toBe(true);
    expect(looksElectrical("11_002_Proposed Ground Floor Plan (P01).pdf")).toBe(false);
    expect(looksElectrical("71_001_Proposed Mechanical Layout_Ground (P01).pdf")).toBe(false);
    expect(looksElectrical("81_001 & 81_002 – Count Check (Batt markup).pdf")).toBe(false);
  });

  it("turns a count into pricing lines: by room, same product added up, off-list items kept as off-list", () => {
    const { items, unmatched } = countToItems(count, products);
    expect(items).toEqual([
      { area: "Ground Kitchen", key: products[0].key, description: "Double socket", qty: 8 },
      { area: "Ground Kitchen", key: products[1].key, description: "Downlight", qty: 8 },
      { area: "First Floor Landing", key: products[1].key, description: "Downlight", qty: 4 },
      { area: "First Floor Landing", key: null, description: "Towel rail spur", qty: 1 },
      { area: "First Floor Landing", key: null, description: "Made-up product", qty: 1 },
    ]);
    // A key that isn't really on the price list is never trusted.
    expect(unmatched).toBe(2);
  });

  it("totals each product across the rooms", () => {
    expect(countTotals(count).slice(0, 2)).toEqual([{ description: "Downlight", qty: 12 }, { description: "Double socket", qty: 8 }]);
  });
});
