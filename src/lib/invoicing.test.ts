import { describe, expect, it } from "vitest";
import { addDays, checkInvoice, finalAmount, ledgerRow, nextInvoiceNumber, parseInvoiceNumber, paymentStages, stageAmount, totals, vatQuarter } from "./invoicing";

describe("invoicing", () => {
  it("follows the payment table on the job's quote", () => {
    expect(paymentStages({ template: "quoteShort", deposit: true })!.map((s) => s.pct)).toEqual([20, 80]);
    expect(paymentStages({ template: "quoteShort", deposit: false })).toEqual([{ label: "On completion", pct: 100 }]);
    expect(paymentStages({ template: "quoteLong" })!.map((s) => s.pct)).toEqual([25, 35, 30, 10]);
    expect(paymentStages({ template: "surveyProposal" })).toEqual([{ label: "On completion of the survey", pct: 100 }]);
    expect(paymentStages(null)).toBeNull();
  });

  it("works out stages to the penny, and the final as what's left", () => {
    expect(stageAmount(7300, 25)).toBe(1825);
    expect(stageAmount(544.29, 20)).toBe(108.86);
    expect(stageAmount(544.29, 80)).toBe(435.43);
    expect(finalAmount(544.29, [], [108.86])).toBe(435.43);
    expect(finalAmount(7300, [272.16, 100], [1825, 2555, 2190])).toBe(1102.16);
  });

  it("adds VAT, or not on reverse charge, and takes 20% of the labour for CIS", () => {
    expect(totals([{ description: "x", qty: 1, unit: 506.8 }], "Standard 20%", null)).toEqual({ net: 506.8, vat: 101.36, gross: 608.16, cisLabour: null, cisDeduction: null, payable: 608.16 });
    expect(totals([{ description: "x", qty: 4, unit: 68.04 }, { description: "y", qty: 1, unit: 380 }], "Reverse charge", 400)).toEqual({ net: 652.16, vat: 0, gross: 652.16, cisLabour: 400, cisDeduction: 80, payable: 572.16 });
  });

  it("refuses an invoice that isn't right, in plain words", () => {
    const ok = { lines: [{ description: "Deposit", qty: 1, unit: 100 }], vat: "Standard 20%" as const, cis: false, cisLabour: null, invoiceDate: "2026-11-23", supplyDate: "2026-11-23", termsDays: 7, clientName: "A", billingAddress: "1 Road" };
    expect(checkInvoice(ok)).toEqual([]);
    expect(checkInvoice({ ...ok, cis: true })).toEqual(["A CIS invoice is reverse charge: no VAT is added.", "Put in the labour amount for the CIS deduction (from the pricing sheet; materials don't count)."]);
    expect(checkInvoice({ ...ok, vat: "Reverse charge", cis: true, cisLabour: 200 })).toEqual(["The CIS labour can't be more than the invoice total."]);
    expect(checkInvoice({ ...ok, lines: [{ description: "[x]", qty: 0, unit: 0 }], billingAddress: " " })).toEqual([
      "Line 1 needs a quantity.", "Line 1 needs a price.", "Line 1: take out the square brackets.", "The invoice comes to £0 or less. For a refund, raise a credit note instead.", "Put in the client's billing address.",
    ]);
  });

  it("numbers on from the highest anywhere, never clashing", () => {
    expect(parseInvoiceNumber("INV-545")).toBe(545);
    expect(parseInvoiceNumber("TEST-INV-1")).toBeNull();
    expect(nextInvoiceNumber(["INV-545", ""], "INV-546", [])).toBe(546);
    expect(nextInvoiceNumber(["INV-545"], "INV-546", [547])).toBe(548);
    expect(nextInvoiceNumber(["INV-545", "INV-550"], "INV-546", [])).toBe(551);
    expect(nextInvoiceNumber([], "", [])).toBe(1);
  });

  it("files by the VAT quarter of the date of supply", () => {
    expect(vatQuarter("2026-11-23")).toEqual({ end: "2026-12-31", folderName: "VAT Qtr to 31 Dec 2026" });
    expect(vatQuarter("2027-01-05")).toEqual({ end: "2027-03-31", folderName: "VAT Qtr to 31 Mar 2027" });
    expect(vatQuarter("2026-06-30").folderName).toBe("VAT Qtr to 30 Jun 2026");
    expect(addDays("2026-11-12", 30)).toBe("2026-12-12");
  });

  it("writes only the ledger's input columns", () => {
    const w = ledgerRow({ number: "INV-546", invoiceDate: "2026-11-23", supplyDate: "2026-11-20", client: "Meterz", clientEmail: "a@b.com", quoteRef: "559", site: "Site", type: "Survey", vat: "Standard 20%", net: 506.8, cisLabour: null, termsDays: 30, pdfUrl: "u", notes: "n" });
    expect(w.map((x) => x.range(2))).toEqual(["Invoices!A2:J2", "Invoices!P2", "Invoices!AA2:AB2"]);
    expect(w[0].values).toEqual(["INV-546", "23/11/2026", "20/11/2026", "Meterz", "a@b.com", "559", "Site", "Survey", "Standard 20%", 506.8]);
    const cis = ledgerRow({ number: "INV-547", invoiceDate: "2026-11-23", supplyDate: "2026-11-23", client: "ep8", clientEmail: "", quoteRef: "560", site: "", type: "Stage payment", vat: "Reverse charge", net: 1000, cisLabour: 600, termsDays: 30, pdfUrl: "", notes: "" });
    expect(cis.map((x) => x.range(9))).toEqual(["Invoices!A9:J9", "Invoices!M9", "Invoices!P9", "Invoices!AA9:AB9"]);
  });
});
