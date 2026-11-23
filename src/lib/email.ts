/** Email pieces that don't need Google: the draft wording, the raw message Gmail stores, and job searches. Pure, tested. */

export type Attachment = { name: string; mimeType: string; data: Buffer };
export type DraftInput = { from: string; to: string; cc: string; subject: string; body: string; attachments: Attachment[] };

const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

/** Splits "a@x.com, b@y.com" into addresses; throws in plain words if any don't look like an email. */
export function parseAddresses(list: string, what: string): string[] {
  const parts = list.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  const bad = parts.filter((p) => !EMAIL.test(p));
  if (bad.length) throw new Error(`${what}: "${bad[0]}" isn't an email address.`);
  return parts;
}

/** The first email address written anywhere in some text, e.g. a job's contact field. */
export function findEmail(text: string): string | null {
  return text.match(/[^\s@<>,;:"()]+@[^\s@<>,;:"()]+\.[a-z]{2,}/i)?.[0] ?? null;
}

/** A header value safe for any characters (£, –, accents). */
export function encodeHeader(value: string) {
  const clean = value.replace(/[\r\n]+/g, " ").trim();
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

const wrap76 = (b64: string) => b64.replace(/(.{76})/g, "$1\r\n");

/** The whole message as Gmail stores it, base64url encoded. Plain text body, any attachments. */
export function buildRaw(d: DraftInput, boundary = "batt-" + Math.random().toString(36).slice(2)): string {
  const to = parseAddresses(d.to, "To");
  if (to.length === 0) throw new Error("Put in who it's to.");
  const cc = parseAddresses(d.cc, "Cc");
  const headers = [
    `From: ${d.from}`,
    `To: ${to.join(", ")}`,
    ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
    `Subject: ${encodeHeader(d.subject)}`,
    "MIME-Version: 1.0",
  ];
  const text = ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(Buffer.from(d.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64"))];
  let mime: string;
  if (d.attachments.length === 0) {
    mime = [...headers, ...text].join("\r\n");
  } else {
    const parts = [
      ["--" + boundary, ...text],
      ...d.attachments.map((a) => [
        "--" + boundary,
        `Content-Type: ${a.mimeType}; name="${encodeHeader(a.name).replace(/"/g, "")}"`,
        `Content-Disposition: attachment; filename="${encodeHeader(a.name).replace(/"/g, "")}"`,
        "Content-Transfer-Encoding: base64",
        "",
        wrap76(a.data.toString("base64")),
      ]),
    ];
    mime = [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts.map((p) => p.join("\r\n")), `--${boundary}--`, ""].join("\r\n");
  }
  return Buffer.from(mime, "utf8").toString("base64url");
}

const gbp = (n: number) => "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** First name from a contact like "John Smith 07700 900123" or "john@x.com". Null if there isn't a plain name. */
export function firstName(contact: string): string | null {
  const word = contact.trim().split(/[\s,]+/)[0] ?? "";
  if (!/^[A-Za-z][a-z'-]+$/.test(word) || word.length < 2) return null;
  return word[0].toUpperCase() + word.slice(1);
}

export type QuoteEmailArgs = {
  kind: "quote" | "survey";
  number: number;
  project: string;
  site: string;
  subtotal: number;
  total: number;
  contact: string;
  sender: { name: string; title: string };
};

/** The covering email for a quote or survey proposal. Plain, warm and short; edited by a person before it's sent. */
export function quoteEmail(a: QuoteEmailArgs): { subject: string; body: string } {
  const doc = a.kind === "survey" ? "survey proposal" : "quotation";
  const name = firstName(a.contact);
  const what = [a.project.trim(), a.site.trim()].filter(Boolean).join(" at ");
  const subject = `${a.kind === "survey" ? "Survey proposal" : "Quotation"} #${a.number}${a.project.trim() ? ` – ${a.project.trim()}` : ""}`;
  const body = [
    name ? `Hi ${name},` : "Hello,",
    "",
    `Thanks for the opportunity to quote. Please find attached our ${doc} #${a.number}${what ? ` for ${what}` : ""}.`,
    "",
    `The total is ${gbp(a.subtotal)} + VAT (${gbp(a.total)} including VAT).`,
    "",
    "To go ahead, just reply to this email or sign the acceptance page and send it back, and we'll confirm a start date.",
    "",
    "Any questions, give me a call on 01296 321321.",
    "",
    "Kind regards,",
    a.sender.name,
    `${a.sender.title}, Batt Electrical`,
    "01296 321321 | battelectrical.com",
  ].join("\n");
  return { subject, body };
}

/** Gmail search for a job's emails: the job number in the subject (as every Batt quote email has), or the client's address. */
export function jobSearch(j: { number: number | null; legacy_ref: string; clientEmail: string | null }): string | null {
  const terms: string[] = [];
  if (j.number !== null) terms.push(`subject:(${j.number})`, `"#${j.number}"`, `"Q-${j.number}"`);
  if (j.legacy_ref) terms.push(`subject:("${j.legacy_ref.replace(/"/g, "")}")`);
  if (j.clientEmail) terms.push(`from:${j.clientEmail}`, `to:${j.clientEmail}`);
  return terms.length ? `{${terms.join(" ")}} newer_than:2y` : null;
}

/** "Callum Blacknell <callum@…>" → "Callum Blacknell". */
export function senderName(from: string) {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  return (m ? m[1] : from).trim();
}

/** Gmail snippets come HTML-escaped ("don&#39;t"). */
export function unescapeHtml(s: string) {
  return s.replace(/&(#\d+|#x[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k[0] === "#") return String.fromCodePoint(k[1] === "x" ? parseInt(k.slice(2), 16) : Number(k.slice(1)));
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[k] ?? m;
  });
}

export type InvoiceEmailArgs = {
  label: string;
  covers: string; // e.g. "the 25% deposit for quotation 559" or "the survey at Hastings Fitness"
  gross: number;
  payable: number;
  cis: boolean;
  dueDate: string; // DD/MM/YYYY
  contact: string;
  sender: { name: string; title: string };
};

/** The email that goes with an invoice (finance--invoicing.md §6): short, friendly, what it's for, how much, when. */
export function invoiceEmail(a: InvoiceEmailArgs): { subject: string; body: string } {
  const name = firstName(a.contact);
  const body = [
    name ? `Hi ${name},` : "Hello,",
    "",
    `Please find attached invoice ${a.label} for ${a.covers}.`,
    "",
    a.cis
      ? `The invoice total is ${gbp(a.gross)} (reverse charge, so no VAT is added). After your CIS deduction of 20% of the labour, the amount payable is ${gbp(a.payable)}, due by ${a.dueDate}.`
      : `The amount due is ${gbp(a.payable)}, by ${a.dueDate}.`,
    "",
    `Payment is by bank transfer, quoting ${a.label} as the reference. Our bank details are on the invoice.`,
    ...(a.cis ? ["", "Once it's paid, please could you send us the CIS payment and deduction statement for our records?"] : []),
    "",
    "Any questions, just let me know.",
    "",
    "Kind Regards,",
    a.sender.name,
    `${a.sender.title}, Batt Electrical`,
    "01296 321321 | battelectrical.com",
  ].join("\n");
  return { subject: `Invoice ${a.label}`, body };
}
