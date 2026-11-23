import { describe, expect, it } from "vitest";
import { chaseStage, chaserEmail, driveId, dueForChase, parseLedger } from "./ledger";

// INV-545 exactly as the real ledger shows it.
const row545 = ["INV-545", "12/11/2026", "12/11/2026", "Meterz", "operations@meterz.co.uk", "Q-549", "Unit 2, Hastings Fitness, Bodmin Retail Park, PL31 2GA", "Survey", "Standard 20%", "£506.80", "£101.36", "£608.16", "", "", "£608.16", "30", "12/12/2026", "12/11/2026", "", "Sent", "0", "", "", "12/12/2026", "31/12/2026", "VAT", "https://drive.google.com/file/d/1VpGNMhVav_Su3Aml6L040wcv46Rf1GDQ/view", "1 survey day…"];

describe("the ledger", () => {
  it("reads a row as the ledger shows it, skipping empty rows", () => {
    const [i, ...rest] = parseLedger([row545, ["", "", ""], []]);
    expect(rest).toEqual([]);
    expect(i).toMatchObject({ row: 2, number: "INV-545", invoiceDate: "2026-11-12", client: "Meterz", gross: 608.16, payable: 608.16, terms: 30, dueDate: "2026-12-12", sentDate: "2026-11-12", paidDate: null, status: "Sent", daysOverdue: 0, nextChase: "2026-12-12" });
  });

  it("knows when a chase is due", () => {
    const [i] = parseLedger([row545]);
    expect(dueForChase(i, "2026-12-11")).toBe(false);
    expect(dueForChase(i, "2026-12-12")).toBe(true);
    expect(dueForChase({ ...i, status: "Paid" }, "2026-12-20")).toBe(false);
  });

  it("chases on the due date, at a week overdue, then firmer every week", () => {
    expect([0, 6, 7, 13, 14, 30].map(chaseStage)).toEqual([1, 1, 2, 2, 3, 3]);
    const [i] = parseLedger([row545]);
    const me = { name: "Callum Blacknell", title: "Project Manager" };
    const one = chaserEmail(i, "Hello,", me);
    expect(one.subject).toBe("Invoice INV-545: payment due");
    expect(one.body).toContain("invoice INV-545 for £608.16 is due today");
    const two = chaserEmail({ ...i, daysOverdue: 8, status: "Overdue" }, "Hello,", me);
    expect(two.body).toContain("now a week overdue");
    expect(two.body).toContain("late fee of 5%");
    const three = chaserEmail({ ...i, daysOverdue: 21, lateFee: 91.22, status: "Overdue" }, "Hi Sam,", me);
    expect(three.body).toContain("21 days overdue");
    expect(three.body).toContain("late fees of £91.22 could now apply");
    expect(three.body).toContain("certificates for the work are held");
    expect(three.body).not.toMatch(/—/);
  });

  it("finds the PDF's Drive id from its link", () => {
    expect(driveId("https://drive.google.com/file/d/1VpGNMhVav_Su3Aml6L040wcv46Rf1GDQ/view")).toBe("1VpGNMhVav_Su3Aml6L040wcv46Rf1GDQ");
    expect(driveId("")).toBeNull();
  });
});

import { cisPayment, parseCisReceived, parseSubcontractors, statementMissing, statementRequest, taxMonthEnding, taxMonthLabel } from "./ledger";

describe("CIS", () => {
  it("works out the tax month: the 6th to the 5th", () => {
    expect(taxMonthEnding("2026-11-05")).toBe("2026-11-05");
    expect(taxMonthEnding("2026-11-06")).toBe("2026-12-05");
    expect(taxMonthEnding("2026-12-20")).toBe("2027-01-05");
    expect(taxMonthLabel("2027-01-05")).toBe("5 Jan 2027");
  });

  it("deducts 20% of the labour only, never the materials", () => {
    expect(cisPayment(1000, 200, 0.2)).toEqual({ labour: 800, deducted: 160, net: 840 });
    expect(cisPayment(637.5, 0, 0.2)).toEqual({ labour: 637.5, deducted: 127.5, net: 510 });
    expect(cisPayment(500, 0, 0)).toEqual({ labour: 500, deducted: 0, net: 500 });
  });

  it("reads CIS Received rows and spots a missing statement after the 19th", () => {
    const [r] = parseCisReceived([["INV-547", "Test Contractor Ltd", "acc@example.com", "20/11/2026", "05/12/2026", "£1,500.00", "£300.00", "19/12/2026", "", "", "31/12/2026", ""]]);
    expect(r).toMatchObject({ invoice: "INV-547", paidDate: "2026-11-20", taxMonthEnding: "2026-12-05", labour: 1500, deducted: 300, statementDue: "2026-12-19", statementReceived: null });
    expect(statementMissing(r, "2026-12-19")).toBe(false);
    expect(statementMissing(r, "2026-12-20")).toBe(true);
    expect(statementMissing({ ...r, statementReceived: "2026-12-10" }, "2026-12-30")).toBe(false);
    const e = statementRequest([r], "Hello,", { name: "Callum Blacknell", title: "Project Manager" });
    expect(e.subject).toBe("CIS payment and deduction statement: tax month ending 5 Dec 2026");
    expect(e.body).toContain("- INV-547, paid 20/11/2026, CIS deducted £300.00");
  });

  it("reads Jed's row, treating [TBC] as not known yet", () => {
    const [jed] = parseSubcontractors([["Jed", "", "94633 65223", "", "20%", "[TBC]", "[TBC]", "Full legal name needed"]]);
    expect(jed).toMatchObject({ name: "Jed", utr: "94633 65223", rate: 0.2, email: "", address: "" });
  });
});
