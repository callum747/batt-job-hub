import { describe, expect, it } from "vitest";
import { folderAreaFor, jobLabel, needsNumber, nextNumber, parseJobNumber, todayUK, ukDate } from "./jobs-rules";

describe("the next job number", () => {
  it("is one more than the highest in use", async () => {
    const { nextNumber } = await import("./jobs-rules");
    expect(nextNumber([559, 560, 561])).toBe(562);
    expect(nextNumber([])).toBe(1);
  });
  it("isn't thrown by a year that was once read as a job number", async () => {
    const { nextNumber } = await import("./jobs-rules");
    expect(nextNumber([559, 561, 2026, 2030, 2031])).toBe(562);
    expect(nextNumber([1998, 1999])).toBe(2000);
    expect(nextNumber([1999, 2000, 2001])).toBe(2002);
  });
});

describe("job numbers", () => {
  it("shows a number as #557", () => expect(jobLabel({ number: 557 })).toBe("#557"));
  it("keeps old references as they were", () => expect(jobLabel({ number: null, legacy_ref: "23-001" })).toBe("23-001"));
  it("shows TBC before a job is quoted", () => expect(jobLabel({ number: null, legacy_ref: "" })).toBe("TBC"));

  it("treats Q-548, #548 and 548 as the same job", () => {
    expect(parseJobNumber("Q-548")).toBe(548);
    expect(parseJobNumber("q548")).toBe(548);
    expect(parseJobNumber("#548")).toBe(548);
    expect(parseJobNumber(" 548 ")).toBe(548);
    expect(parseJobNumber("Meterz")).toBeNull();
  });

  it("gives the next number as the highest plus one", () => {
    expect(nextNumber([539, 556, 553])).toBe(557);
    expect(nextNumber([])).toBe(1);
  });

  it("numbers a job when it moves past Enquiry, but not when lost or on hold", () => {
    expect(needsNumber("Draft quote", null)).toBe(true);
    expect(needsNumber("Booked", null)).toBe(true);
    expect(needsNumber("Enquiry", null)).toBe(false);
    expect(needsNumber("Lost", null)).toBe(false);
    expect(needsNumber("On hold", null)).toBe(false);
    expect(needsNumber("Quoted", 557)).toBe(false);
  });
});

describe("Drive folder for each stage", () => {
  it("follows the brief", () => {
    expect(folderAreaFor("Quoted")).toBe("Live");
    expect(folderAreaFor("Invoiced")).toBe("Active");
    expect(folderAreaFor("Paid")).toBe("Completed");
    expect(folderAreaFor("Closed")).toBe("Completed");
    expect(folderAreaFor("Lost")).toBe("Lost");
    expect(folderAreaFor("On hold")).toBeNull();
  });
});

describe("dates", () => {
  it("shows UK format", () => expect(ukDate("2027-01-23")).toBe("23/01/2027"));
  it("shows nothing for no date", () => expect(ukDate(null)).toBe(""));
  it("works out today in UK time, not UTC", () => {
    // 23:30 UTC on 30 June is 00:30 on 1 July in London (BST)
    expect(todayUK(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
  });
});
