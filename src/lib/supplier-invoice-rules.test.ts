import { describe, expect, it } from "vitest";
import { decide, matchByAddress, numbersIn, type InvoiceReading, type JobSite } from "./supplier-invoice-rules";

const jobs = new Map([[552, 552], [557, 557], [553, 555], [555, 555]]);
const base: InvoiceReading = {
  is_invoice_or_credit_note: true, is_credit_note: false, addressed_to_batt: true, supplier: "CEF", invoice_number: "INV1",
  invoice_date: "2026-11-20", net: 412.5, vat: 82.5, gross: 495, order_reference: "#552 CBRE CROYDEN", job_numbers: [],
};

const sites: JobSite[] = [
  { number: 526, site: "19 Back Street, Wendover", postcode: "HP22 6EB", open: true },
  { number: 557, site: "Oaken Grove, Shire Lane, Tring", postcode: "HP23 6LY", open: true },
  { number: 539, site: "31B Church Lane, Weston Turville", postcode: "HP22 5SJ", open: true },
  { number: 555, site: "31C Buckingham Street, Aylesbury", postcode: "HP20 2NQ", open: false },
  { number: 562, site: "Elsinore House, 43 Buckingham Street, Aylesbury", postcode: "HP20 2NQ", open: true },
  { number: 543, site: "Brook House, High Street, Long Wittenham", postcode: "OX14 4QQ", open: true },
];

describe("matching an invoice to a job by its address", () => {
  it("is sure on the same postcode or the same house number and street", () => {
    expect(matchByAddress("Deliver to: 19 Back St, Wendover HP226EB", sites)).toEqual({ sure: [526], rough: [] });
    expect(matchByAddress("31b Church Ln Weston Turville", sites)).toEqual({ sure: [539], rough: [] });
  });
  it("is only rough on a street or place name with nothing else", () => {
    expect(matchByAddress("OAKEN GROVE TRING", sites)).toEqual({ sure: [], rough: [557] });
    expect(matchByAddress("Site: Brook House", sites)).toEqual({ sure: [], rough: [543] });
  });
  it("prefers the job that's still open when two share an address, and ignores Batt's own office", () => {
    expect(matchByAddress("Buckingham Street Aylesbury HP20 2NQ", sites)).toEqual({ sure: [562], rough: [] });
    expect(matchByAddress("18 Alwin Close, Aylesbury, HP21 8RP", sites)).toEqual({ sure: [], rough: [] });
    expect(matchByAddress("Collected at branch", sites)).toEqual({ sure: [], rough: [] });
  });
});

describe("supplier invoices with no job number", () => {
  const noRef = { ...base, order_reference: "CALLUM" };
  it("goes on the job when the delivery address is a sure match", () => {
    expect(decide({ ...noRef, delivery_address: "19 Back Street, Wendover, HP22 6EB" }, jobs, false, sites)).toEqual({
      status: "filed", jobNumber: 526, amount: 412.5, reason: 'No job number on it, but the address matches job #526 ("19 Back Street, Wendover, HP22 6EB").',
    });
  });
  it("waits with a suggestion when the match is only rough, and when the order reference names the site", () => {
    expect(decide({ ...noRef, delivery_address: "Oaken Grove, Tring" }, jobs, false, sites)).toMatchObject({ status: "check", suggest: [557], reason: 'No job number on it. The address ("Oaken Grove, Tring") looks like job #557, but it isn\'t a sure match.' });
    expect(decide({ ...base, order_reference: "BROOK HOUSE" }, jobs, false, sites)).toMatchObject({ status: "check", suggest: [543] });
  });
  it("waits with no suggestion when nothing matches, and a job number still beats an address", () => {
    expect(decide({ ...noRef, delivery_address: "Unit 9 Somewhere Else, Leeds LS1 1AA" }, jobs, false, sites)).toMatchObject({ status: "check", reason: 'No job number found in the order reference "CALLUM", and the address doesn\'t match a job.' });
    expect(decide({ ...base, delivery_address: "19 Back Street, Wendover, HP22 6EB" }, jobs, false, sites)).toMatchObject({ status: "filed", jobNumber: 552 });
  });
});

describe("supplier invoices", () => {
  it("finds job numbers in order references, not in prices or long numbers", () => {
    expect(numbersIn("#552 CBRE CROYDEN")).toEqual([552]);
    expect(numbersIn("PO 557/558")).toEqual([557, 558]);
    expect(numbersIn("Order 104468")).toEqual([]);
    expect(numbersIn("ALS/104468 £552.10")).toEqual([]);
  });

  it("files an invoice with one real job number, at the net amount", () => {
    expect(decide(base, jobs, false)).toEqual({ status: "filed", jobNumber: 552, amount: 412.5, reason: 'Order reference "#552 CBRE CROYDEN".' });
  });

  it("files a credit note as a minus amount", () => {
    expect(decide({ ...base, is_credit_note: true, net: 20, vat: 4, gross: 24 }, jobs, false)).toMatchObject({ status: "filed", amount: -20 });
  });

  it("puts a merged number on the job it was merged into", () => {
    expect(decide({ ...base, order_reference: "553" }, jobs, false)).toMatchObject({ status: "filed", jobNumber: 555 });
  });

  it("leaves quotes and statements alone, and doesn't file the same invoice twice", () => {
    expect(decide({ ...base, is_invoice_or_credit_note: false }, jobs, false).status).toBe("ignored");
    expect(decide(base, jobs, true)).toMatchObject({ status: "ignored", reason: "CEF INV1 is already on a job." });
  });

  it("asks a person when anything is unclear", () => {
    expect(decide({ ...base, addressed_to_batt: false }, jobs, false).status).toBe("check");
    expect(decide({ ...base, vat: null }, jobs, false).status).toBe("check");
    expect(decide({ ...base, gross: 500 }, jobs, false)).toMatchObject({ status: "check", reason: "Net £412.50 + VAT £82.50 doesn't equal the total £500.00." });
    expect(decide({ ...base, order_reference: "Van stock" }, jobs, false)).toMatchObject({ status: "check", amount: 412.5, reason: 'No job number found in the order reference "Van stock", and the address doesn\'t match a job.' });
    expect(decide({ ...base, order_reference: "999" }, jobs, false).status).toBe("check");
    expect(decide({ ...base, order_reference: "552 and 557" }, jobs, false)).toMatchObject({ status: "check", reason: "More than one job on it: #552, #557." });
  });
});
