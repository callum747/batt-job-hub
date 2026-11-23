import { describe, expect, it } from "vitest";
import { checkSurveyPricing, priceSurvey, type SurveyPricing } from "./survey";

const base: SurveyPricing = { days: 1, dayRate: 280, miles: 304, perMile: 0.45, route: "", weekend: false };

describe("survey pricing, checked against Batt's past quotes", () => {
  it("Q-546 Dean Retail Park: 1 day + 304 miles = £416.80", () => {
    const r = priceSurvey(base);
    expect(r.subtotal).toBe(416.8);
    expect(r.lines.map((l) => l.amount)).toEqual([280, 136.8]);
    expect(r.lines[1].description).toBe("304 miles round trip (152 miles each way) from our Aylesbury registered office, at 45p per mile");
  });
  it("Q-547: 2 days + 165 miles = £634.25", () => expect(priceSurvey({ ...base, days: 2, miles: 165, route: "Aylesbury to High Wycombe, Stanmore and Stevenage and back" }).subtotal).toBe(634.25));
  it("Q-548: 4 days + 623 miles = £1,400.35", () => expect(priceSurvey({ ...base, days: 4, miles: 623 }).subtotal).toBe(1400.35));
  it("Q-549 Hastings Fitness: 1 day + 504 miles = £506.80", () => expect(priceSurvey({ ...base, miles: 504 }).subtotal).toBe(506.8));
  it("adds VAT to the penny", () => {
    const r = priceSurvey({ ...base, days: 4, miles: 623 });
    expect([r.vat, r.total]).toEqual([280.07, 1680.42]);
  });
  it("charges weekends at 1.5 times", () => {
    const r = priceSurvey({ ...base, weekend: true, miles: 0 });
    expect(r.subtotal).toBe(420);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].description).toBe("1 survey day at £420.00 per day (weekend rate, 1.5 times)");
  });
  it("names the route when one trip covers several sites, without each-way miles", () => {
    expect(priceSurvey({ ...base, miles: 165, route: "Aylesbury to Stanmore and Stevenage and back" }).lines[1].description).toBe(
      "165 miles round trip (Aylesbury to Stanmore and Stevenage and back) from our Aylesbury registered office, at 45p per mile",
    );
  });
  it("won't price without real miles", () => {
    expect(checkSurveyPricing({ ...base, miles: NaN }).join(" ")).toMatch(/exact round-trip/);
    expect(checkSurveyPricing({ ...base, days: 1.3 }).join(" ")).toMatch(/half days/);
    expect(checkSurveyPricing(base)).toEqual([]);
  });
});
