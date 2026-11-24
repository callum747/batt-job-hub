import { describe, expect, it } from "vitest";
import { buildMatrix, expiryText, qualState, type Qualification } from "./training";

const q = (person_id: string, name: string, expires: string | null, extra: Partial<Qualification> = {}): Qualification => ({ id: `${person_id}-${name}-${expires}`, person_id, person: person_id, name, number: "", issued: null, expires, file_url: "", notes: "", active: true, ...extra });

describe("the training matrix", () => {
  const today = "2026-11-24";
  it("knows held, running out within 60 days, and expired", () => {
    expect([qualState({ expires: null }, today), qualState({ expires: "2027-06-01" }, today), qualState({ expires: "2026-12-20" }, today), qualState({ expires: "2026-11-23" }, today)]).toEqual(["held", "held", "soon", "expired"]);
  });
  it("puts people down the side and every qualification across the top, most widely held first", () => {
    const people = [{ id: "cam", short_name: "Cam" }, { id: "cal", short_name: "Callum" }, { id: "jed", short_name: "Jed" }];
    const m = buildMatrix(people, [
      q("cam", "ECS Gold Card", "2027-03-01"), q("cal", "ecs gold card", "2026-12-01"), q("cal", "C&G 2391", null),
      q("cal", "IPAF", "2025-01-01"), q("cal", "IPAF", "2029-01-01"), q("jed", "Old card", "2020-01-01", { active: false }),
    ], today);
    expect(m.columns).toEqual(["ECS Gold Card", "C&G 2391", "IPAF"]);
    expect(m.rows.map((r) => [r.person, ...r.cells.map((c) => c.state)])).toEqual([
      ["Cam", "held", "none", "none"],
      ["Callum", "soon", "held", "held"],
      ["Jed", "none", "none", "none"],
    ]);
  });
  it("says when something runs out in words", () => {
    expect([expiryText({ name: "IPAF", expires: "2026-12-06" }, today), expiryText({ name: "IPAF", expires: "2026-11-21" }, today), expiryText({ name: "AM2", expires: null }, today)]).toEqual(["IPAF runs out in 12 days", "IPAF ran out 3 days ago", "AM2 doesn't run out"]);
  });
});
