/**
 * Survey pricing, from the playbook: survey days at the survey day rate (£280, deliberately at
 * about cost) plus exact road miles at 45p, from the Aylesbury registered office. No pricing sheet.
 * Pure, tested. Money is worked in whole pence.
 */

export type SurveyUnit = { name: string; area: string; scope: string };
export type SurveySite = { name: string; address: string; postcode: string; units: SurveyUnit[] };

export type SurveyPricing = {
  days: number;
  dayRate: number; // £ per survey day
  miles: number; // exact round-trip road miles for the whole job
  perMile: number; // £ per mile
  /** Route for a trip covering several sites, e.g. "Aylesbury to Stanmore to Stevenage and back". Empty for one site. */
  route: string;
  weekend: boolean; // weekend days at 1.5 times
};

export type SurveyLine = { section: string; description: string; amount: number };

const pence = (n: number) => Math.round(n * 100);
const pounds = (p: number) => p / 100;
const fmt = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

export function checkSurveyPricing(p: SurveyPricing): string[] {
  const out: string[] = [];
  if (!(p.days > 0) || Math.round(p.days * 2) !== p.days * 2) out.push("Survey days must be more than 0, in whole or half days.");
  if (!(p.dayRate > 0)) out.push("The survey day rate is missing.");
  if (!Number.isFinite(p.miles) || p.miles < 0) out.push("Add the exact round-trip road miles from 18 Alwin Close (0 if there's no travel). Never an estimate.");
  if (!(p.perMile > 0)) out.push("The mileage rate is missing.");
  return out;
}

/** The lines for the investment table, worded as the playbook asks, and the totals. */
export function priceSurvey(p: SurveyPricing) {
  const rate = p.weekend ? pence(p.dayRate) * 1.5 : pence(p.dayRate);
  const daysP = Math.round(rate * p.days);
  const milesP = Math.round(p.miles * pence(p.perMile));
  const lines: SurveyLine[] = [
    {
      section: "Survey",
      description: `${num(p.days)} survey day${p.days === 1 ? "" : "s"} at ${fmt(pounds(rate))} per day${p.weekend ? " (weekend rate, 1.5 times)" : ""}`,
      amount: pounds(daysP),
    },
  ];
  if (p.miles > 0) {
    const bracket = p.route ? ` (${p.route})` : ` (${num(p.miles / 2)} miles each way)`;
    lines.push({
      section: "Mileage",
      description: `${num(p.miles)} miles round trip${bracket} from our Aylesbury registered office, at ${Math.round(p.perMile * 100)}p per mile`,
      amount: pounds(milesP),
    });
  }
  const subtotalP = daysP + milesP;
  const vatP = Math.round(subtotalP * 0.2);
  return { lines, subtotal: pounds(subtotalP), vat: pounds(vatP), total: pounds(subtotalP + vatP) };
}
