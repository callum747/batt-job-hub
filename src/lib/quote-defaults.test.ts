import { describe, expect, it } from "vitest";
import { defaultShortQuote } from "./quote-defaults";
import { checkShortQuote } from "./quote-short";

const base = {
  number: 557,
  client: { name: "Amit Tripathi", notes: "", payment_days: null },
  site: "8 Alwin Close, Aylesbury",
  postcode: "HP21 8RP",
  description: "8 double sockets and a new radial circuit. Client wants it before Christmas.",
  pricing: {
    items: [
      { area: "Kitchen", key: "Double socket | Click | White Plastic", description: "Double socket", qty: 8 },
      { area: "kitchen", key: null, description: "New radial circuit", qty: 1, materialEach: 38.5, hoursEach: 3 },
      { area: "", key: "Pendant  | MK | White Plastic ", description: "Pendant", qty: 2 },
    ],
    miles: 40, people: 2, vans: 1, parking: 0, waste: 0, access: 0, other: 0, oneElectrician: false,
  },
  lines: [
    { kind: "item", description: "Double socket", detail: "Kitchen", qty: 8, amount: 544.29 },
    { kind: "item", description: "New radial circuit", detail: "kitchen", qty: 1, amount: 177.65 },
    { kind: "item", description: "Pendant", detail: "", qty: 2, amount: 97.32 },
    { kind: "prelims", description: "Travel and site costs", detail: "40 miles round trip at 45p a mile", qty: 1, amount: 13.82 },
  ],
  subtotal: 833.08,
  preparedBy: { name: "Callum Blacknell", title: "Project Manager", email: "callum@battelectrical.com" },
  today: "2026-11-23",
};

describe("first draft of a quote", () => {
  const q = defaultShortQuote(base);
  it("groups the schedule by area, ignoring case", () => {
    expect(q.schedule.map((g) => [g.area, g.items.length])).toEqual([["Kitchen", 2], ["General", 1]]);
    expect(q.schedule[0].items[0]).toEqual({ item: "Double socket", ref: "8", works: "Supply and fit 8 × double socket (Click, White Plastic)" });
    expect(q.schedule[1].items[0].works).toBe("Supply and fit 2 × pendant (MK, White Plastic)");
  });
  it("makes one investment line per priced line, adding up to the subtotal", () => {
    expect(q.investment.map((l) => l.section)).toEqual(["Kitchen", "kitchen", "Works", "Travel and site costs"]);
    expect(q.investment[3].description).toBe("40 miles round trip at 45p a mile");
    expect(q.subtotal).toBe(833.08);
    expect(q.vat).toBe(166.62);
    expect(q.total).toBe(999.7);
  });
  it("dates it today, valid for 30 days", () => {
    expect([q.date, q.validUntil]).toEqual(["23/11/2026", "23/12/2026"]);
  });
  it("uses the first sentence as the project name and adds the postcode once", () => {
    expect(q.project).toBe("8 double sockets and a new radial circuit");
    expect(q.site).toBe("8 Alwin Close, Aylesbury, HP21 8RP");
    expect(defaultShortQuote({ ...base, site: "8 Alwin Close, HP21 8RP" }).site).toBe("8 Alwin Close, HP21 8RP");
  });
  it("is ready to build as it stands", () => expect(checkShortQuote(q)).toEqual([]));
  it("follows the client's terms: no deposit and 30 days for Meterz", () => {
    const m = defaultShortQuote({ ...base, client: { name: "Meterz", notes: "30-day payment terms, no deposit.", payment_days: 30 } });
    expect([m.deposit, m.paymentDays]).toEqual([false, 30]);
  });
});

import { defaultLongQuote, pointColumn } from "./quote-defaults";
import { checkLongQuote } from "./quote-long";

describe("long form first draft", () => {
  it("counts points into the right appendix columns", () => {
    expect(pointColumn("Double socket | Click | White Plastic")).toBe("DS");
    expect(pointColumn("Double socket (USB) | Knightsbridge  | Black Nickel")).toBe("USB");
    expect(pointColumn("Fused spur | Click | White Plastic")).toBe("FS");
    expect(pointColumn("Data module + plate | Corston  | Antique Brass")).toBe("Data");
    expect(pointColumn("Downlights  | JCC  | Any Colour Bezel")).toBe("DL");
    expect(pointColumn("Pendant  | MK | White Plastic ")).toBe("Pend");
    expect(pointColumn("2-gang 2-way switch | Click | White Plastic")).toBe("Sw");
    expect(pointColumn("Toggle switch module | Corston  | Antique Brass")).toBeNull();
    expect(pointColumn("Fan isolator | Click | White Plastic")).toBeNull();
    expect(pointColumn("Smoke Detector  | Aico Ei3016 | -")).toBe("Det");
    expect(pointColumn("Consumer Unit  | Fusebox | 15 way with SPD")).toBeNull();
  });

  const sectionOf = (k: string) => (/socket|spur|data/i.test(k) ? "Power & Data" : /pendant|downlight/i.test(k) ? "Lighting" : null);
  const q = defaultLongQuote({ ...base, sectionOf, clientType: "Main contractor", client: { name: "ep8 Design & Build", notes: "", payment_days: null } });

  it("groups the investment by price list section, with travel on Preliminaries, adding up to the subtotal", () => {
    expect(q.sections.map((s) => [s.section, s.amount])).toEqual([["Power and data", 544.29], ["Other works", 177.65], ["Lighting", 97.32]]);
    expect(q.sections[0].description).toBe("8 × double socket");
    expect(q.prelims).toBe(13.82);
    expect(q.subtotal).toBe(833.08);
  });
  it("takes per-point rates only from items priced on this job", () => {
    expect(q.rates).toEqual({ socket: 68.04, downlight: null, data: null });
  });
  it("builds the point schedule room by room, and a lighting key", () => {
    expect(q.rooms).toEqual([{ room: "Kitchen", points: { DS: 8 } }, { room: "General", points: { Pend: 2 } }]);
    expect(q.fittings).toEqual([{ ref: "P1", fitting: "MK Pendant", notes: "White Plastic" }]);
  });
  it("gives main contractors 30 days", () => expect(q.paymentDays).toBe(30));
  it("is ready to build as it stands", () => expect(checkLongQuote(q)).toEqual([]));
});
