import { describe, expect, it } from "vitest";
import { eventBody, eventTitle, jobFolderName, JOB_SUBFOLDERS, parseJobFolderName, type EventInput } from "./format";

const base: EventInput = {
  jobNumber: 549,
  client: "Hastings Fitness",
  contact: "Gwen",
  site: "Bodmin, PL31 1AA",
  work: "Meter survey",
  notes: "",
  folderUrl: "https://drive.google.com/drive/folders/abc",
  date: "2026-11-26",
  start: null,
  end: null,
  confirmed: true,
  people: [{ short_name: "Callum", email: "callum@example.com" }],
};

describe("job folder", () => {
  it("is named number, client, site with en dashes", () => {
    expect(jobFolderName({ number: 557, client: "Meterz", site: "1 Finsbury Circus, London" })).toBe("557 – Meterz – 1 Finsbury Circus, London");
  });
  it("copes with no client and slashes", () => {
    expect(jobFolderName({ number: 558, client: null, site: "Unit 4/5 The Yard" })).toBe("558 – Unit 4-5 The Yard");
  });
  it("has the eight standard subfolders", () => {
    expect(JOB_SUBFOLDERS).toHaveLength(8);
    expect(JOB_SUBFOLDERS[0]).toBe("01 - Quote & Contract");
    expect(JOB_SUBFOLDERS[7]).toBe("08 - Handover & O&M");
  });
});

describe("reading a folder made by hand", () => {
  it("reads number, client and site, with an en dash or a hyphen", () => {
    expect(parseJobFolderName("560 – Smith Homes – 4 Oak Road, Aylesbury")).toEqual({ number: 560, client: "Smith Homes", site: "4 Oak Road, Aylesbury" });
    expect(parseJobFolderName("561 - Meterz - Unit 2 - Bodmin")).toEqual({ number: 561, client: "Meterz", site: "Unit 2 – Bodmin" });
    expect(parseJobFolderName("Q-549 – Meterz")).toEqual({ number: 549, client: "Meterz", site: "" });
    expect(parseJobFolderName("562")).toEqual({ number: 562, client: "", site: "" });
  });
  it("ignores folders that aren't jobs", () => {
    expect(parseJobFolderName("00 - Templates")).toBeNull();
    expect(parseJobFolderName("Old quotes")).toBeNull();
    expect(parseJobFolderName("2026 Archive")).toBeNull();
    expect(parseJobFolderName("23-001 Kitchen")).toBeNull();
  });
});

describe("calendar event", () => {
  it("is titled like the playbook says", () => {
    expect(eventTitle(base)).toBe("#549 Hastings Fitness – Meter survey (Callum)");
  });
  it("marks a pencilled-in visit", () => {
    expect(eventTitle({ ...base, confirmed: false })).toMatch(/^Pencilled in: #549/);
  });
  it("makes an all-day event end the next day", () => {
    const b = eventBody({ ...base, date: "2026-12-31" });
    expect(b.start).toEqual({ date: "2026-12-31" });
    expect(b.end).toEqual({ date: "2027-01-01" });
  });
  it("makes a timed event in UK time", () => {
    const b = eventBody({ ...base, start: "10:00", end: "14:30" });
    expect(b.start).toEqual({ dateTime: "2026-11-26T10:00:00", timeZone: "Europe/London" });
    expect(b.end).toEqual({ dateTime: "2026-11-26T14:30:00", timeZone: "Europe/London" });
  });
  it("gives a timed event with no finish one hour", () => {
    expect(eventBody({ ...base, start: "10:00" }).end).toEqual({ dateTime: "2026-11-26T11:00:00", timeZone: "Europe/London" });
  });
  it("invites only people with an email", () => {
    const b = eventBody({ ...base, people: [...base.people, { short_name: "Jed", email: "" }] });
    expect(b.attendees).toEqual([{ email: "callum@example.com" }]);
    expect(b.summary).toContain("(Callum, Jed)");
  });
  it("puts client, contact, work and folder in the description", () => {
    expect(eventBody(base).description).toBe("Client: Hastings Fitness\nContact: Gwen\nWork: Meter survey\nJob folder: https://drive.google.com/drive/folders/abc");
  });
});
