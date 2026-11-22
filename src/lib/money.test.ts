import { describe, expect, it } from "vitest";
import { dayFraction, gbp, jobMoney, marginLight, type MoneyInput } from "./money";

const base: MoneyInput = {
  quoteValue: 0,
  approvedVariations: [],
  invoicedNet: null,
  visits: [],
  milesRoundTrip: null,
  perMile: 0.45,
  costs: [],
  today: "2026-11-22",
};

describe("dayFraction", () => {
  it("counts an all-day visit as one day", () => expect(dayFraction(null, null)).toBe(1));
  it("counts 4 hours as half a day", () => expect(dayFraction("08:00", "12:00")).toBe(0.5));
  it("never counts more than a full day", () => expect(dayFraction("07:00", "19:00")).toBe(1));
  it("treats a finish before the start as all day", () => expect(dayFraction("12:00", "08:00")).toBe(1));
});

describe("jobMoney", () => {
  it("adds approved extras to the quote", () => {
    const r = jobMoney({ ...base, quoteValue: 1000, approvedVariations: [150.5] });
    expect(r.income).toBe(1150.5);
  });

  it("uses net invoiced instead of the quote once invoiced", () => {
    const r = jobMoney({ ...base, quoteValue: 1000, approvedVariations: [200], invoicedNet: 1180 });
    expect(r.income).toBe(1180);
  });

  it("costs labour per person per day, counting today but not future visits", () => {
    const r = jobMoney({
      ...base,
      quoteValue: 2000,
      visits: [
        { date: "2026-11-20", start: null, end: null, dayCosts: [286, 119] },
        { date: "2026-11-22", start: "08:00", end: "12:00", dayCosts: [286] },
        { date: "2026-11-30", start: null, end: null, dayCosts: [286, 286] },
      ],
    });
    expect(r.labour).toBe(286 + 119 + 143);
  });

  it("charges travel per separate visit day, not per visit", () => {
    const r = jobMoney({
      ...base,
      quoteValue: 1000,
      milesRoundTrip: 40,
      visits: [
        { date: "2026-11-18", start: "08:00", end: "10:00", dayCosts: [286] },
        { date: "2026-11-18", start: "14:00", end: "16:00", dayCosts: [286] },
        { date: "2026-11-19", start: null, end: null, dayCosts: [286] },
      ],
    });
    expect(r.visitDays).toBe(2);
    expect(r.travel).toBe(36); // 40 × £0.45 × 2
  });

  it("has no travel cost when the miles aren't known", () => {
    const r = jobMoney({ ...base, visits: [{ date: "2026-11-18", start: null, end: null, dayCosts: [286] }] });
    expect(r.travel).toBe(0);
  });

  it("works out profit and margin to the penny", () => {
    const r = jobMoney({
      ...base,
      quoteValue: 1439.4,
      milesRoundTrip: 92,
      visits: [{ date: "2026-11-21", start: null, end: null, dayCosts: [286, 286, 119] }],
      costs: [18, 120.33, -20],
    });
    expect(r.labour).toBe(691);
    expect(r.travel).toBe(41.4);
    expect(r.otherCosts).toBe(118.33);
    expect(r.spent).toBe(850.73);
    expect(r.profit).toBe(588.67);
    expect(r.margin).toBe(40.9);
  });

  it("avoids floating point drift on many small costs", () => {
    const r = jobMoney({ ...base, quoteValue: 1, costs: Array(10).fill(0.1) });
    expect(r.otherCosts).toBe(1);
    expect(r.profit).toBe(0);
  });

  it("has no margin when there's no income yet", () => {
    expect(jobMoney(base).margin).toBeNull();
  });
});

describe("marginLight", () => {
  const t = { green: 18, red: 5 };
  it("is green at exactly the green threshold", () => expect(marginLight(18, t)).toBe("green"));
  it("is amber just under green", () => expect(marginLight(17.9, t)).toBe("amber"));
  it("is amber at exactly the red threshold", () => expect(marginLight(5, t)).toBe("amber"));
  it("is red below the red threshold", () => expect(marginLight(4.9, t)).toBe("red"));
  it("is red for a loss", () => expect(marginLight(-12, t)).toBe("red"));
  it("shows nothing without income", () => expect(marginLight(null, t)).toBe("none"));
});

describe("gbp", () => {
  it("formats pounds and pence", () => expect(gbp(1439.4)).toBe("£1,439.40"));
  it("formats whole pounds", () => expect(gbp(16175.64, { whole: true })).toBe("£16,176"));
});
