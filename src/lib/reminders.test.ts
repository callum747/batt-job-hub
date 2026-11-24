import { describe, expect, it } from "vitest";
import { quoteChase, quoteChaserEmail, stuckReason } from "./reminders";

describe("chasing quotes", () => {
  const q = { stage: "Quoted", quoted_at: "2026-11-10", quote_chased_at: null, quote_chases: 0 };
  it("is due a week after the quote went, then a week after each chase", () => {
    expect(quoteChase(q, "2026-11-16")).toMatchObject({ due: false, nextOn: "2026-11-17", daysSinceSent: 6 });
    expect(quoteChase(q, "2026-11-17").due).toBe(true);
    const chased = { ...q, quote_chased_at: "2026-11-17", quote_chases: 1 };
    expect(quoteChase(chased, "2026-11-23")).toMatchObject({ due: false, nextOn: "2026-11-24" });
    expect(quoteChase(chased, "2026-11-24").due).toBe(true);
  });
  it("isn't due if the quote hasn't been sent, or the job has moved on", () => {
    expect(quoteChase({ ...q, quoted_at: null }, "2026-12-30").due).toBe(false);
    expect(quoteChase({ ...q, stage: "Booked" }, "2026-12-30").due).toBe(false);
  });
  it("re-sending a quote after a chase restarts the clock", () => {
    expect(quoteChase({ ...q, quoted_at: "2026-11-20", quote_chased_at: "2026-11-17", quote_chases: 1 }, "2026-11-24")).toMatchObject({ due: false, nextOn: "2026-11-27" });
  });

  const base = { ref: "#557/1", what: "garage lighting at Oaken Grove", sentOn: "2026-11-10", today: "2026-11-17", firstName: "Patsy", attached: true };
  it("first asks if it arrived, then if it's still wanted, then offers to close it off", () => {
    const one = quoteChaserEmail({ ...base, chasesSoFar: 0, originalSubject: "Quotation #557/1 – Garage lighting" });
    expect(one).toMatchObject({ nth: 1, subject: "Re: Quotation #557/1 – Garage lighting" });
    expect(one.body).toBe(
      "Hi Patsy,\n\nDid our quotation #557/1 for garage lighting at Oaken Grove reach you safely? It went over on 10/11/2026. I've attached it again for ease.\n\nIf you have any questions, or would like anything changed, give me a call on 01296 321321 and we can go through it.\n\nKind Regards,",
    );
    const two = quoteChaserEmail({ ...base, today: "2026-11-24", chasesSoFar: 1 });
    expect(two.nth).toBe(2);
    expect(two.body).toContain("The quote is valid until 10/12/2026.");
    expect(quoteChaserEmail({ ...base, today: "2026-12-20", chasesSoFar: 1 }).body).toContain("30 days ran out on 10/12/2026");
    const three = quoteChaserEmail({ ...base, chasesSoFar: 5, firstName: "", attached: false });
    expect(three).toMatchObject({ nth: 3, subject: "Quotation #557/1" });
    expect(three.body).toMatch(/^Hello,\n\nThis is my last note on quotation #557\/1/);
    expect(three.body).not.toContain("attached");
  });
  it("never uses an em dash or signs off with a name", () => {
    for (const n of [0, 1, 2]) {
      const b = quoteChaserEmail({ ...base, chasesSoFar: n }).body;
      expect(b).not.toMatch(/—/);
      expect(b.endsWith("Kind Regards,")).toBe(true);
    }
  });
});

describe("jobs that have stopped moving", () => {
  const j = { stage: "Complete", updated_at: "2026-11-20T10:00:00Z", received: null, end_date: null, hasFutureVisit: false };
  it("flags work finished and not invoiced, drafts not sent, old enquiries and bookings with no visit", () => {
    expect(stuckReason(j, "2026-11-24")).toBe("Finished 4 days ago and not invoiced.");
    expect(stuckReason(j, "2026-11-22")).toBeNull();
    expect(stuckReason({ ...j, stage: "Draft quote" }, "2026-11-24")).toBe("Quote drafted 4 days ago and not sent.");
    expect(stuckReason({ ...j, stage: "Enquiry" }, "2026-11-22")).toBe("Enquiry not touched for 2 days. Quote it or mark it Lost.");
    expect(stuckReason({ ...j, stage: "Booked" }, "2026-11-24")).toBe("Booked, but there's no visit in the diary.");
    expect(stuckReason({ ...j, stage: "Booked", hasFutureVisit: true }, "2026-11-24")).toBeNull();
    expect(stuckReason({ ...j, stage: "Quoted" }, "2026-12-24")).toBeNull();
  });
});
