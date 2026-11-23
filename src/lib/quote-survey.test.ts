import { describe, expect, it } from "vitest";
import { captureSurveyStyles, checkSurveyQuote, locateSurvey, surveyStructurePass, surveyStylePass, surveyTextPass, type SurveyQuote } from "./quote-survey";
import { priceSurvey } from "./survey";
import { applyText, buildDoc, type Part } from "./test-doc";


/** The survey proposal template's layout, as read from the real template on 23/11/2026. */
function template(opts: { schedule?: string[][]; investment?: string[][] } = {}): Part[] {
  const unit = ["[Unit / area]", "[0,000]", "[Electric, gas, water etc]"];
  return [
    [["PROPOSAL REF\nQ-[000]"]],
    "SURVEY", "PROPOSAL", "POWERING PROFITABLE PROPERTY", "PREPARED FOR", "[Client name]", "[Site name]  |  [Site address, postcode]",
    [["REVISION\nA", "DATE\n[DD/MM/YYYY]", "VALID UNTIL\n[DD/MM/YYYY]", "PREPARED BY\n[Name]"]],
    "02   YOUR SURVEY", "  Survey Summary",
    "[Two sentences: who has asked us to survey, which site and what is being surveyed, and how many survey days it is priced for.]",
    "Our surveyor will visit each item in the schedule below and record the existing supplies and metering. The survey is priced at our survey day rate, with mileage charged separately at 45p per mile from our Aylesbury registered office.",
    "Survey schedule (anything not listed is excluded)",
    [["Item", "Area (sq ft)", "Survey scope"], ...(opts.schedule ?? [["[SITE NAME, ADDRESS, POSTCODE]", "", ""], unit, unit, unit, unit, unit])],
    "03   YOUR INVESTMENT", "  Investment Summary",
    [["Section", "Description", "Subtotal ex VAT"], ...(opts.investment ?? [["Survey", "[Number] survey day(s) at £280.00 per day", "£[0.00]"], ["Mileage", "[Miles] miles round trip ([Miles] each way) from our Aylesbury registered office, at 45p per mile", "£[0.00]"]])],
    [["", "Subtotal", "£[0.00]"], ["", "VAT @ 20%", "£[0.00]"], ["", "Total (inc VAT)", "£[0.00]"]],
    "  Payment Terms",
    [["Stage", "Amount"], ["On completion of the survey", "100%"]],
    "Payable by bank transfer, cheque or card within 7 days of invoice. Late payments may incur 5% after 7 days and 5% each further week.",
    "Assumptions",
    { text: "The survey is completed in [number] day(s) by one surveyor; any additional time will be agreed in writing beforehand", bullet: true },
    [["Thank you for the opportunity to quote for the survey at [site name]. If anything needs adjusting, please get in touch.\n[Name]   [Job title], Batt Electrical  |  01296 321321  |  [email]@battelectrical.com"]],
    "By instructing Batt Electrical to carry out the survey, you accept this quotation (Q-[000]), including the scope and price set out above.",
  ];
}

const price = priceSurvey({ days: 2, dayRate: 280, miles: 165, perMile: 0.45, route: "Aylesbury to High Wycombe, Stanmore and Stevenage and back", weekend: false });
const quote: SurveyQuote = {
  number: 547,
  client: "Meterz",
  siteName: "High Wycombe, Stanmore and Stevenage",
  siteAddress: "Three retail parks",
  date: "23/11/2026",
  validUntil: "23/12/2026",
  preparedBy: { name: "Callum Blacknell", title: "Project Manager", email: "callum@battelectrical.com" },
  summary: "Meterz have asked us to survey the metering at three retail parks. The survey is priced for two days.",
  sites: [
    { name: "Roaring Meg South", address: "London Road, Stevenage", postcode: "SG1 1XN", units: [{ name: "Unit 1 – Boots", area: "8,000", scope: "Electric, gas and water" }, { name: "Unit 2 – Next", area: "", scope: "Electric" }] },
    { name: "Stanmore Retail", address: "Honeypot Lane", postcode: "HA7 1BA", units: [{ name: "Unit 4", area: "5,200", scope: "Electric and EV chargers" }] },
  ],
  days: 2,
  lines: price.lines,
  subtotal: price.subtotal,
  vat: price.vat,
  total: price.total,
  paymentDays: 30,
};

function afterStructure(q: SurveyQuote) {
  const sched: string[][] = [];
  for (let i = 0; i < q.sites.reduce((n, s) => n + 1 + s.units.length, 0); i++) sched.push(["", "", ""]);
  const inv = [["Survey", "", ""], ...(q.lines.length > 1 ? [["Mileage", "", ""]] : [])];
  return buildDoc(template({ schedule: sched, investment: inv }));
}

describe("survey proposal", () => {
  it("finds every part of the real layout", () => {
    const l = locateSurvey(buildDoc(template()));
    expect(l.schedule.rows).toHaveLength(7);
    expect(l.investment.rows).toHaveLength(3);
  });
  it("pass 1: two sites with 2 and 1 units need 5 rows, so one of the template's 6 goes", () => {
    const reqs = surveyStructurePass(buildDoc(template()), quote);
    expect(reqs.filter((r) => r.deleteTableRow)).toHaveLength(1);
    expect(reqs.filter((r) => r.insertTableRow)).toHaveLength(0);
  });
  it("pass 1: drops the mileage row when there's no travel", () => {
    const p = priceSurvey({ days: 1, dayRate: 280, miles: 0, perMile: 0.45, route: "", weekend: false });
    const reqs = surveyStructurePass(buildDoc(template()), { ...quote, lines: p.lines, subtotal: p.subtotal, vat: p.vat, total: p.total });
    expect(reqs.filter((r) => r.deleteTableRow)).toHaveLength(2);
  });

  const doc = afterStructure(quote);
  const out = applyText(doc, surveyTextPass(doc, quote));
  it("pass 2: leaves no placeholder", () => expect(out).not.toMatch(/\[/));
  it("pass 2: puts each site's name, address and postcode in capitals on its own row, with tbc for a missing area", () => {
    expect(out).toContain("Item\nArea (sq ft)\nSurvey scope\nROARING MEG SOUTH, LONDON ROAD, STEVENAGE, SG1 1XN\n\n\nUnit 1 – Boots\n8,000\nElectric, gas and water\nUnit 2 – Next\ntbc\nElectric\nSTANMORE RETAIL, HONEYPOT LANE, HA7 1BA\n\n\nUnit 4\n5,200\nElectric and EV chargers\n");
  });
  it("pass 2: prices it like Q-547, £634.25 + VAT", () => {
    expect(out).toContain("Survey\n2 survey days at £280.00 per day\n£560.00\nMileage\n165 miles round trip (Aylesbury to High Wycombe, Stanmore and Stevenage and back) from our Aylesbury registered office, at 45p per mile\n£74.25\n");
    expect(out).toContain("Subtotal\n£634.25\n\nVAT @ 20%\n£126.85\n\nTotal (inc VAT)\n£761.10\n");
  });
  it("pass 2: uses Meterz's 30 days, says how many days, and signs it", () => {
    expect(out).toContain("within 30 days of invoice");
    expect(out).toContain("The survey is completed in 2 days by one surveyor");
    expect(out).toContain("quote for the survey at High Wycombe, Stanmore and Stevenage.");
    expect(out).toContain("Callum Blacknell   Project Manager, Batt Electrical  |  01296 321321  |  callum@battelectrical.com");
    expect(out).toContain("PREPARED BY\nCallum Blacknell\n");
    expect(out).toContain("PROPOSAL REF\n#547\n");
  });
  it("pass 3: site rows get the site look and unit rows the unit look", () => {
    const raw = buildDoc(template());
    const t = locateSurvey(raw).schedule;
    t.rows[1][0][0].paragraph.elements![0].textRun!.textStyle = { bold: true };
    t.rows[2][0][0].paragraph.elements![0].textRun!.textStyle = { fontSize: { magnitude: 9.5, unit: "PT" } };
    const styles = captureSurveyStyles(raw);
    const filled = buildDoc(template({ schedule: [["ROARING MEG", "", ""], ["Unit 1", "8,000", "Electric"], ["Unit 2", "tbc", "Electric"], ["STANMORE", "", ""], ["Unit 4", "5,200", "Electric"]] }));
    const reqs = surveyStylePass(filled, quote, styles) as { updateTextStyle: { textStyle: object } }[];
    expect(reqs.map((r) => "bold" in r.updateTextStyle.textStyle)).toEqual([true, false, false, true, false]);
  });
  it("checks the content first", () => {
    expect(checkSurveyQuote(quote)).toEqual([]);
    expect(checkSurveyQuote({ ...quote, sites: [{ ...quote.sites[0], postcode: "" }] }).join(" ")).toMatch(/postcode/);
    expect(checkSurveyQuote({ ...quote, subtotal: 600 }).join(" ")).toMatch(/add up/);
  });
});
