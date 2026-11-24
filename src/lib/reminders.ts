/**
 * What needs chasing: quotes with no answer, and jobs that have sat in one stage too long. Pure, tested.
 * (Overdue invoices are worked out by the ledger itself; see ledger.ts.)
 */

const DAY = 86_400_000;
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / DAY);
export function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const uk = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export type ChaseJob = { stage: string; quoted_at: string | null; quote_chased_at: string | null; quote_chases: number };

/** A quote is chased every `every` days from when it was sent (or last chased) until it's answered. */
export function quoteChase(j: ChaseJob, today: string, every = 7): { due: boolean; nextOn: string | null; daysSinceSent: number | null; chases: number } {
  if (j.stage !== "Quoted" || !j.quoted_at) return { due: false, nextOn: null, daysSinceSent: null, chases: j.quote_chases };
  const last = j.quote_chased_at && j.quote_chased_at > j.quoted_at ? j.quote_chased_at : j.quoted_at;
  const nextOn = addDays(last, every);
  return { due: nextOn <= today, nextOn, daysSinceSent: daysBetween(j.quoted_at, today), chases: j.quote_chases };
}

/** Quotes are valid for 30 days from the day they were sent. */
export const validUntil = (quotedAt: string) => addDays(quotedAt, 30);

export type QuoteChaser = { subject: string; body: string; nth: 1 | 2 | 3 };

/**
 * The chaser for a quote. First: did it arrive. Second: is it still wanted, and can anything be changed.
 * Third and after: a last note, offering to close it off. Friendly and direct, never as if Batt is short of work.
 */
export function quoteChaserEmail(a: { ref: string; what: string; sentOn: string; today: string; chasesSoFar: number; firstName: string; attached: boolean; originalSubject?: string }): QuoteChaser {
  const nth = (Math.min(3, a.chasesSoFar + 1)) as 1 | 2 | 3;
  const hi = a.firstName ? `Hi ${a.firstName},` : "Hello,";
  const what = a.what.trim() ? ` for ${a.what.trim()}` : "";
  const again = a.attached ? " I've attached it again for ease." : "";
  const until = validUntil(a.sentOn);
  const stillValid = until >= a.today;
  const lines =
    nth === 1
      ? [
          `Did our quotation ${a.ref}${what} reach you safely? It went over on ${uk(a.sentOn)}.${again}`,
          "",
          "If you have any questions, or would like anything changed, give me a call on 01296 321321 and we can go through it.",
        ]
      : nth === 2
        ? [
            `Following up on our quotation ${a.ref}${what}, sent on ${uk(a.sentOn)}.${again}`,
            "",
            "Are you still looking to go ahead? If the scope or the price needs another look, tell me what would help and I'll rework it.",
            "",
            stillValid ? `The quote is valid until ${uk(until)}.` : `The quote's 30 days ran out on ${uk(until)}, so if you'd like to go ahead I'll confirm the price still stands.`,
          ]
        : [
            `This is my last note on quotation ${a.ref}${what}, sent on ${uk(a.sentOn)}.${again}`,
            "",
            "If it's no longer needed, just let me know and I'll close it off at our end. If you'd still like to go ahead, we'd be glad to get it booked in.",
          ];
  const subject = a.originalSubject?.trim() ? (/^re:/i.test(a.originalSubject) ? a.originalSubject.trim() : `Re: ${a.originalSubject.trim()}`) : `Quotation ${a.ref}`;
  return { nth, subject, body: [hi, "", ...lines, "", "Kind Regards,"].join("\n") };
}

export type StuckJob = { stage: string; updated_at: string; received: string | null; end_date: string | null; hasFutureVisit: boolean };

/** Why a job needs a nudge, or null if it's moving. `updated_at` is when anything on the job last changed. */
export function stuckReason(j: StuckJob, today: string): string | null {
  const idle = daysBetween(j.updated_at.slice(0, 10), today);
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  if (j.stage === "Enquiry" && idle >= 2) return `Enquiry not touched for ${days(idle)}. Quote it or mark it Lost.`;
  if (j.stage === "Draft quote" && idle >= 3) return `Quote drafted ${days(idle)} ago and not sent.`;
  if (j.stage === "Booked" && !j.hasFutureVisit && idle >= 2) return "Booked, but there's no visit in the diary.";
  if (j.stage === "Complete" && idle >= 3) return `Finished ${days(idle)} ago and not invoiced.`;
  if (j.stage === "On hold" && idle >= 30) return `On hold for ${days(idle)}. Still wanted?`;
  return null;
}
