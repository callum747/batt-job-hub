import { describe, expect, it } from "vitest";
import { decide, numbersIn, type InvoiceReading } from "./supplier-invoice-rules";

const jobs = new Map([[552, 552], [557, 557], [553, 555], [555, 555]]);
const base: InvoiceReading = {
  is_invoice_or_credit_note: true, is_credit_note: false, addressed_to_batt: true, supplier: "CEF", invoice_number: "INV1",
  invoice_date: "2026-11-20", net: 412.5, vat: 82.5, gross: 495, order_reference: "#552 CBRE CROYDEN", job_numbers: [],
};

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
    expect(decide({ ...base, order_reference: "Van stock" }, jobs, false)).toMatchObject({ status: "check", amount: 412.5, reason: 'No job number found in the order reference "Van stock".' });
    expect(decide({ ...base, order_reference: "999" }, jobs, false).status).toBe("check");
    expect(decide({ ...base, order_reference: "552 and 557" }, jobs, false)).toMatchObject({ status: "check", reason: "More than one job on it: #552, #557." });
  });
});
