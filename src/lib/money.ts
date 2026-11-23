/**
 * Job money: income, what's been spent so far, profit and the margin light.
 * Everything is worked in whole pence so totals never drift.
 *
 * Profit = income − (labour + travel + cost rows)
 *  - income: net invoiced once invoiced, otherwise quote + approved extras
 *  - labour: every visit up to and including today × each person on it × their day cost;
 *            a timed visit counts as hours ÷ 8 of a day (never more than a full day)
 *  - fuel and travel: as the quote worked it out per day (round-trip miles × vans × per-mile rate), × separate visit days
 */

export const HOURS_PER_DAY = 8;

export type MoneyVisit = {
  date: string; // YYYY-MM-DD
  start: string | null; // HH:MM, null = all day
  end: string | null;
  dayCosts: number[]; // one per person on the visit, in pounds
};

export type MoneyInput = {
  quoteValue: number;
  approvedVariations: number[];
  invoicedNet: number | null; // null until anything is invoiced
  visits: MoneyVisit[];
  milesRoundTrip: number | null;
  /** Vans travelling each day, from the quote. Defaults to 1. */
  vans?: number;
  perMile: number;
  costs: number[];
  today: string; // YYYY-MM-DD
};

export type Light = "green" | "amber" | "red" | "none";

export type MoneyResult = {
  income: number;
  labour: number;
  travel: number;
  otherCosts: number;
  spent: number;
  profit: number;
  margin: number | null; // percentage, one decimal place; null when there's no income
  visitDays: number;
};

const toPence = (pounds: number) => Math.round(pounds * 100);
const toPounds = (pence: number) => pence / 100;

function minutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Share of a working day a visit takes: 1 for all-day visits, hours ÷ 8 for timed ones, capped at 1. */
export function dayFraction(start: string | null, end: string | null): number {
  if (!start || !end) return 1;
  const mins = minutes(end) - minutes(start);
  if (mins <= 0) return 1;
  return Math.min(1, mins / 60 / HOURS_PER_DAY);
}

export function jobMoney(input: MoneyInput): MoneyResult {
  const pastVisits = input.visits.filter((v) => v.date <= input.today);

  const incomeP =
    input.invoicedNet !== null
      ? toPence(input.invoicedNet)
      : toPence(input.quoteValue) + input.approvedVariations.reduce((s, a) => s + toPence(a), 0);

  const labourP = pastVisits.reduce((sum, v) => {
    const f = dayFraction(v.start, v.end);
    return sum + v.dayCosts.reduce((s, c) => s + Math.round(toPence(c) * f), 0);
  }, 0);

  const visitDays = new Set(pastVisits.map((v) => v.date)).size;
  const travelP = input.milesRoundTrip ? Math.round(input.milesRoundTrip * (input.vans ?? 1) * toPence(input.perMile) * visitDays) : 0;

  const otherP = input.costs.reduce((s, c) => s + toPence(c), 0);
  const spentP = labourP + travelP + otherP;
  const profitP = incomeP - spentP;

  return {
    income: toPounds(incomeP),
    labour: toPounds(labourP),
    travel: toPounds(travelP),
    otherCosts: toPounds(otherP),
    spent: toPounds(spentP),
    profit: toPounds(profitP),
    margin: incomeP > 0 ? Math.round((profitP / incomeP) * 1000) / 10 : null,
    visitDays,
  };
}

/** Green at or above the green threshold, red below the red threshold, amber between. */
export function marginLight(margin: number | null, thresholds: { green: number; red: number }): Light {
  if (margin === null) return "none";
  if (margin >= thresholds.green) return "green";
  if (margin < thresholds.red) return "red";
  return "amber";
}

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const GBP0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

export function gbp(n: number, opts: { whole?: boolean } = {}) {
  return (opts.whole ? GBP0 : GBP).format(n);
}
