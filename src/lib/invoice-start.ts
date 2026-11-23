import "server-only";
/** Everything the invoice form starts from, for one job: the quote's stages, what's been invoiced, the client and the rates. */
import { sql } from "./db";
import { getClient, getSettings, type JobRow } from "./data";
import { googleSettings } from "./google/client";
import { jobInvoices } from "./google/invoice-run";
import { paymentStages, stageAmount, finalAmount, type Stage } from "./invoicing";
import { todayUK } from "./jobs-rules";

export type InvoiceStart = {
  test: boolean;
  quoteRef: string;
  quoteNet: number;
  stages: (Stage & { amount: number; done: boolean })[];
  finalAmount: number;
  invoicedNet: number;
  variations: { description: string; amount: number }[];
  labourSell: number | null;
  client: { id: string | null; name: string; email: string; address: string; type: string; contractor: boolean };
  site: string;
  termsDays: number;
  today: string;
  dayRate: number;
  perMile: number;
  miles: number | null;
  template: string;
};

export async function invoiceStart(job: JobRow): Promise<InvoiceStart> {
  const [client, settings, g, invoices, variations] = await Promise.all([
    job.client_id ? getClient(job.client_id) : null,
    getSettings(),
    googleSettings(),
    jobInvoices(job.id),
    sql<{ description: string; amount: number }[]>`select description, amount from variations where job_id = ${job.id} and approved order by created_at`,
  ]);
  const q = job.quote_draft as unknown as { template?: string; deposit?: boolean; subtotal?: number; paymentDays?: number } | null;
  const quoteNet = q?.subtotal ?? job.quote_value;
  const test = g.mode === "test";
  const counted = invoices.filter((i) => ["made", "sent", "paid"].includes(i.status) && i.test === test);
  const stages = (paymentStages(q) ?? []).map((s) => ({ ...s, amount: stageAmount(quoteNet, s.pct), done: counted.some((i) => i.stage_label === s.label) }));
  const vars = variations.map((v) => ({ ...v }));
  return {
    test,
    quoteRef: job.number ? String(job.number) : job.legacy_ref,
    quoteNet,
    stages,
    finalAmount: finalAmount(quoteNet, vars.map((v) => v.amount), counted.map((i) => i.net)),
    invoicedNet: counted.reduce((s, i) => s + Number(i.net), 0),
    variations: vars,
    labourSell: job.pricing?.result.labourSell ?? null,
    client: {
      id: client?.id ?? null,
      name: client?.name ?? "",
      email: client?.email ?? "",
      address: client?.billing_address ?? "",
      type: client?.type ?? "",
      contractor: /contractor/i.test(client?.type ?? ""),
    },
    site: [job.site, job.postcode].filter(Boolean).join(", "),
    termsDays: client?.payment_days ?? q?.paymentDays ?? 7,
    today: todayUK(),
    dayRate: settings.rates?.dayRate ?? 380,
    perMile: settings.rates?.perMile ?? 0.45,
    miles: job.miles_round_trip,
    template: q?.template ?? "",
  };
}
