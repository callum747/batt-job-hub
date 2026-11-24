import { describe, expect, it } from "vitest";
import { dueItems, dueText, vehicleFolderName } from "./vehicles";

describe("what's due on a vehicle", () => {
  const v = { mot_due: "2026-12-06", tax_due: "2026-11-21", insurance_due: "2027-06-01", service_due: null };
  it("lists the dates that are set, soonest first, and flags overdue and within 30 days", () => {
    expect(dueItems(v, "2026-11-24").map((d) => [d.what, d.days, d.state])).toEqual([["Road tax", -3, "overdue"], ["MOT", 12, "soon"], ["Insurance", 189, "ok"]]);
  });
  it("says it in words", () => {
    const [tax, mot] = dueItems(v, "2026-11-24");
    expect([dueText(tax), dueText(mot), dueText({ ...mot, days: 0 }), dueText({ ...mot, days: 1 })]).toEqual(["Road tax 3 days overdue", "MOT due in 12 days", "MOT due today", "MOT due in 1 day"]);
  });
  it("names the Drive folder by registration then name", () => {
    expect(vehicleFolderName({ registration: "ab12 cde", name: "Callum's Transporter" })).toBe("AB12 CDE – Callum's Transporter");
    expect(vehicleFolderName({ registration: "", name: "Trailer" })).toBe("Trailer");
  });
});
