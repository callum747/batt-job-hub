import "server-only";
import { sql } from "../db";
import { audit, changeStage } from "../mutations";
import { captureSurveyStyles, checkSurveyQuote, surveyStructurePass, surveyStylePass, surveyTextPass, type SurveyQuote } from "../quote-survey";
import { checkSurveyPricing, priceSurvey, type SurveyPricing, type SurveySite } from "../survey";
import { buildDocument, type Filler, type QuoteOutcome } from "./quote-run";
import { syncJobFolder } from "./drive";

export const SURVEY_PROPOSAL: Filler<SurveyQuote> = {
  template: "surveyProposal",
  label: "Survey Proposal",
  check: checkSurveyQuote,
  captureStyles: captureSurveyStyles,
  structurePass: surveyStructurePass,
  textPass: surveyTextPass,
  stylePass: surveyStylePass as never,
  minPages: 3,
};

export type SurveyForm = {
  siteName: string;
  siteAddress: string;
  summary: string;
  sites: SurveySite[];
  days: number;
  miles: number;
  route: string;
  weekend: boolean;
  paymentDays: number;
  date: string;
  validUntil: string;
  preparedBy: { name: string; title: string; email: string };
};

/**
 * Prices a survey from the rates in Settings (never from figures typed in the browser),
 * numbers the job if needed, saves the price on the job, then makes the survey proposal.
 */
export async function makeSurveyProposal(jobId: string, form: SurveyForm, me: { email: string; name: string }): Promise<QuoteOutcome> {
  const [rates] = await sql<{ value: { surveyDay: number; perMile: number } }[]>`select value from settings where key = 'rates'`;
  const pricing: SurveyPricing = { days: form.days, dayRate: rates.value.surveyDay, miles: form.miles, perMile: rates.value.perMile, route: form.route, weekend: form.weekend };
  const problems = checkSurveyPricing(pricing);
  if (problems.length) return { ok: false, message: "A few things need fixing before the survey can be priced.", problems };
  const price = priceSurvey(pricing);

  let [job] = await sql<{ number: number | null; stage: string; client: string | null }[]>`
    select j.number, j.stage, c.name as client from jobs j left join clients c on c.id = j.client_id where j.id = ${jobId}`;
  if (!job) return { ok: false, message: "That job doesn't exist." };
  if (job.number === null) {
    if (job.stage !== "Enquiry") return { ok: false, message: `Move the job to Draft quote first. It's at ${job.stage} with no number.` };
    await changeStage(jobId, "Draft quote", me.email);
  }
  await syncJobFolder(jobId, me.email);
  [job] = await sql`select j.number, j.stage, c.name as client from jobs j left join clients c on c.id = j.client_id where j.id = ${jobId}`;

  const q: SurveyQuote = {
    number: job.number!,
    client: job.client ?? "",
    siteName: form.siteName,
    siteAddress: form.siteAddress,
    date: form.date,
    validUntil: form.validUntil,
    preparedBy: form.preparedBy,
    summary: form.summary,
    sites: form.sites,
    days: form.days,
    lines: price.lines,
    subtotal: price.subtotal,
    vat: price.vat,
    total: price.total,
    paymentDays: form.paymentDays,
  };
  const check = checkSurveyQuote(q);
  if (check.length) return { ok: false, message: "A few things need fixing before the proposal can be made.", problems: check };

  await sql.begin(async (tx) => {
    await tx`update jobs set quote_value = ${price.subtotal}, miles_round_trip = ${form.miles}, updated_at = now() where id = ${jobId}`;
    await tx`delete from quote_lines where job_id = ${jobId}`;
    for (const [i, l] of price.lines.entries()) {
      await tx`insert into quote_lines (job_id, kind, description, detail, qty, rate, cost, amount, position)
        values (${jobId}, ${l.section === "Survey" ? "survey" : "mileage"}, ${l.section}, ${l.description}, ${l.section === "Survey" ? form.days : form.miles}, 0, 0, ${l.amount}, ${i})`;
    }
    await audit(tx, me.email, "survey priced", "job", jobId, { subtotal: price.subtotal, days: form.days, miles: form.miles });
  });
  return buildDocument(jobId, SURVEY_PROPOSAL, q, me);
}
