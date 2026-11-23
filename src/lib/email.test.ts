import { describe, expect, it } from "vitest";
import { unescapeHtml, buildRaw, encodeHeader, findEmail, firstName, jobSearch, parseAddresses, quoteEmail, senderName } from "./email";

const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");

describe("email", () => {
  it("reads addresses and refuses ones that aren't", () => {
    expect(parseAddresses("a@x.com, b@y.co.uk;c@z.org", "To")).toEqual(["a@x.com", "b@y.co.uk", "c@z.org"]);
    expect(parseAddresses("  ", "Cc")).toEqual([]);
    expect(() => parseAddresses("a@x.com, bob", "To")).toThrow('To: "bob" isn\'t an email address.');
  });

  it("finds an email in a contact line", () => {
    expect(findEmail("John Smith (john.smith@meterz.co.uk) 07700 900123")).toBe("john.smith@meterz.co.uk");
    expect(findEmail("John 07700 900123")).toBeNull();
  });

  it("encodes headers with £ and dashes", () => {
    expect(encodeHeader("Quotation 559")).toBe("Quotation 559");
    const e = encodeHeader("Quotation 559 – Kitchen");
    expect(e).toMatch(/^=\?UTF-8\?B\?/);
    expect(Buffer.from(e.slice(10, -2), "base64").toString("utf8")).toBe("Quotation 559 – Kitchen");
    expect(encodeHeader("Bad\r\nBcc: x@y.com")).toBe("Bad Bcc: x@y.com");
  });

  it("builds a message with a PDF attached", () => {
    const raw = buildRaw(
      { from: "callum@battelectrical.com", to: "client@example.com", cc: "cameron@battelectrical.com", subject: "Quotation 559 – Kitchen", body: "Hi John,\n\n£7,300.00 + VAT", attachments: [{ name: "559 – Quote.pdf", mimeType: "application/pdf", data: Buffer.from("%PDF-1.7 test") }] },
      "B",
    );
    const m = decode(raw);
    expect(m).toContain("To: client@example.com\r\nCc: cameron@battelectrical.com\r\n");
    expect(m).toContain('Content-Type: multipart/mixed; boundary="B"');
    expect(m).toContain("Content-Type: application/pdf;");
    expect(m).toContain(Buffer.from("%PDF-1.7 test").toString("base64"));
    expect(m).toContain(Buffer.from("Hi John,\r\n\r\n£7,300.00 + VAT").toString("base64"));
    expect(m.trimEnd().endsWith("--B--")).toBe(true);
  });

  it("won't build a message with nobody to send it to", () => {
    expect(() => buildRaw({ from: "a@b.com", to: "", cc: "", subject: "x", body: "y", attachments: [] })).toThrow("Put in who it's to.");
  });

  it("picks a first name only when there is one", () => {
    expect(firstName("john Smith 07700")).toBe("John");
    expect(firstName("info@meterz.co.uk")).toBeNull();
    expect(firstName("")).toBeNull();
    expect(firstName("07700 900123")).toBeNull();
  });

  it("writes the covering email", () => {
    const e = quoteEmail({ kind: "quote", number: 559, project: "Ground floor rewire", site: "12 Test Lane, Aylesbury", subtotal: 7300, total: 8760, contact: "John Smith", sender: { name: "Callum Blacknell", title: "Project Manager" } });
    expect(e.subject).toBe("Quotation 559 – Ground floor rewire");
    expect(e.body).toContain("Hi John,");
    expect(e.body).toContain("our quotation 559 for Ground floor rewire at 12 Test Lane, Aylesbury.");
    expect(e.body).toContain("£7,300.00 + VAT (£8,760.00 including VAT)");
    expect(e.body).toContain("Callum Blacknell\nProject Manager, Batt Electrical");
    expect(e.body).not.toMatch(/—/);
    const s = quoteEmail({ kind: "survey", number: 560, project: "", site: "", subtotal: 416.8, total: 500.16, contact: "", sender: { name: "Cameron Batt", title: "Managing Director" } });
    expect(s.subject).toBe("Survey proposal 560");
    expect(s.body).toMatch(/^Hello,\n/);
    expect(s.body).toContain("our survey proposal 560.");
  });

  it("searches Gmail for a job", () => {
    expect(jobSearch({ number: 559, legacy_ref: "", clientEmail: "john@x.com" })).toBe('{subject:(559) "Q-559" from:john@x.com to:john@x.com} newer_than:2y');
    expect(jobSearch({ number: null, legacy_ref: "23-001", clientEmail: null })).toBe('{subject:("23-001")} newer_than:2y');
    expect(jobSearch({ number: null, legacy_ref: "", clientEmail: null })).toBeNull();
  });

  it("tidies Gmail snippets", () => {
    expect(unescapeHtml("Don&#39;t forget &amp; call &quot;Bob&quot; &#x27;now&#x27;")).toBe(`Don't forget & call "Bob" 'now'`);
  });

  it("shows a sender's name", () => {
    expect(senderName('"John Smith" <john@x.com>')).toBe("John Smith");
    expect(senderName("john@x.com")).toBe("john@x.com");
  });
});
