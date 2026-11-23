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
