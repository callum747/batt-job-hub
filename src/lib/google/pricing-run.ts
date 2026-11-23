import "server-only";
import { sql } from "../db";
import { changeStage, audit } from "../mutations";
import {
  buildLines, buildWrites, FIRST_ROW, parsePriceList, parseProfit, validatePricing,
  type PricingInput, type PricingResult, type Product, type QuoteLine,
} from "../pricing";
import { errorText, google, GoogleError, googleSettings, SHEETS } from "./client";
import { getFile, listChildren, syncJobFolder } from "./drive";

type Cell = string | number | boolean | null;
const DAY = 24 * 60 * 60 * 1000;

export async function templateId(which: "pricing" | "quoteShort" | "quoteLong" | "surveyProposal" | "rams" | "invoice") {
  const [row] = await sql<{ value: Record<string, string> }[]>`select value from settings where key = 'templates'`;
  const id = row?.value?.[which];
  if (!id) throw new GoogleError(`The ${which} template isn't set up in the database.`);
  return id;
}

async function readRange(email: string, sheetId: string, range: string) {
  const r = await google<{ values?: Cell[][] }>(email, `${SHEETS}/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`, {
    query: { valueRenderOption: "UNFORMATTED_VALUE" },
  });
  return r.values ?? [];
}

/** The price list from the pricing template. Kept for a day, or until someone presses refresh. */
export async function loadPriceList(email: string, force = false): Promise<{ products: Product[]; fetchedAt: string }> {
  const [row] = await sql<{ value: { products: Product[]; fetchedAt: string } }[]>`select value from settings where key = 'price_list'`;
  if (!force && row && Date.now() - new Date(row.value.fetchedAt).getTime() < DAY && row.value.products.length) return row.value;
  const products = parsePriceList(await readRange(email, await templateId("pricing"), "'Product Price List'!B1:L600"));
  if (products.length === 0) throw new GoogleError("The price list in the pricing template came back empty.");
  const value = { products, fetchedAt: new Date().toISOString() };
  await sql`insert into settings (key, value) values ('price_list', ${sql.json(value)})
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
  return value;
}

/**
 * The job's "01 - Quote & Contract" folder, or null when the app is in test mode and the job
 * folder is a real one (nothing is ever written into a real folder in test mode).
 */
export async function quoteFolder(email: string, jobFolderId: string): Promise<string | null> {
  const settings = await googleSettings();
  if (settings.mode === "test") {
    const parent = (await getFile(email, jobFolderId)).parents?.[0];
    if (!parent || !Object.values(settings.test.folders).includes(parent)) return null;
  }
  const subfolders = await listChildren(email, [jobFolderId], true);
  return subfolders.find((f) => f.name.startsWith("01"))?.id ?? jobFolderId;
}

export type SavedPricing = { input: PricingInput; result: PricingResult; sheetId: string; sheetUrl: string; pricedAt: string; by: string; revision: number };
export type PriceOutcome = { ok: boolean; message: string; problems?: string[]; number?: number | null };

/**
 * Prices a job: copies the pricing template into the job's 01 folder, writes the items,
 * reads the answer back and saves it on the job. The sheet does every sum.
 */
export async function priceJob(jobId: string, input: PricingInput, me: { email: string; name: string }): Promise<PriceOutcome> {
  let sheetUrl = "";
  try {
    const { products } = await loadPriceList(me.email);
    const problems = validatePricing(input, products);
    if (problems.length) return { ok: false, message: "A few things need fixing before this can be priced.", problems };

    // A job gets its number the moment it is priced.
    let [job] = await sql<{ number: number | null; stage: string; site: string; client: string | null; drive_folder_id: string; drive_error: string; merged_into: string | null }[]>`
      select j.number, j.stage, j.site, c.name as client, j.drive_folder_id, j.drive_error, j.merged_into
      from jobs j left join clients c on c.id = j.client_id where j.id = ${jobId}`;
    if (!job) return { ok: false, message: "That job doesn't exist." };
    if (job.number === null) {
      if (job.stage !== "Enquiry") return { ok: false, message: `Move the job to Draft quote first. It's at ${job.stage} with no number.` };
      await changeStage(jobId, "Draft quote", me.email);
    }
    await syncJobFolder(jobId, me.email);
    [job] = await sql`select j.number, j.stage, j.site, c.name as client, j.drive_folder_id, j.drive_error, j.merged_into
      from jobs j left join clients c on c.id = j.client_id where j.id = ${jobId}`;
    if (!job.drive_folder_id) return { ok: false, message: `The job needs its Drive folder before it can be priced. ${job.drive_error}`, number: job.number };

    const target = await quoteFolder(me.email, job.drive_folder_id);
    if (!target) {
      return { ok: false, message: "This job's Drive folder is a real one and the app is in test mode, so nothing was saved to it. Try pricing a new test job, or go live in Settings.", number: job.number };
    }
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from documents where job_id = ${jobId} and kind = 'pricing'`;
    const revision = n + 1;
    const name = `#${job.number} – ${(job.site || job.client || "Job").replace(/[\\/]+/g, "-")} – Pricing${revision > 1 ? ` rev ${revision}` : ""}`;

    const copy = await google<{ id: string; webViewLink?: string }>(me.email, `/drive/v3/files/${await templateId("pricing")}/copy`, {
      method: "POST",
      query: { supportsAllDrives: true, fields: "id,webViewLink" },
      body: { name, parents: [target] },
    });
    sheetUrl = copy.webViewLink ?? `https://docs.google.com/spreadsheets/d/${copy.id}/edit`;
    await sql`insert into documents (job_id, kind, revision, name, doc_id, url, created_by) values (${jobId}, 'pricing', ${revision}, ${name}, ${copy.id}, ${sheetUrl}, ${me.email})`;

    await google(me.email, `${SHEETS}/v4/spreadsheets/${copy.id}/values:batchUpdate`, {
      method: "POST",
      body: { valueInputOption: "RAW", data: buildWrites(input) },
    });

    const last = FIRST_ROW + input.items.length - 1;
    const rows = await readRange(me.email, copy.id, `'Job Pricing'!B${FIRST_ROW}:M${last}`);
    const result = parseProfit(await readRange(me.email, copy.id, "Profit!B5:C41"));
    const [rates] = await sql<{ value: { perMile?: number } }[]>`select value from settings where key = 'rates'`;
    const lines: QuoteLine[] = buildLines(input, rows, result, rates?.value?.perMile ?? 0.45);

    const saved: SavedPricing = { input, result, sheetId: copy.id, sheetUrl, pricedAt: new Date().toISOString(), by: me.name, revision };
    await sql.begin(async (tx) => {
      await tx`update jobs set quote_value = ${result.sellExVat}, miles_round_trip = ${input.miles}, pricing = ${tx.json(saved as never)}, updated_at = now() where id = ${jobId}`;
      await tx`delete from quote_lines where job_id = ${jobId}`;
      for (const [i, l] of lines.entries()) {
        await tx`insert into quote_lines (job_id, kind, description, detail, qty, rate, cost, amount, position)
          values (${jobId}, ${l.kind}, ${l.description}, ${l.detail}, ${l.qty}, ${l.rate}, ${l.cost}, ${l.amount}, ${i})`;
      }
      await audit(tx, me.email, "priced", "job", jobId, { sellExVat: result.sellExVat, revision, sheetId: copy.id });
    });
    const gbp = (v: number) => `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return {
      ok: true,
      number: job.number,
      message: `Priced at ${gbp(result.sellExVat)} ex VAT (${gbp(result.sellIncVat)} inc VAT), ${result.netMargin}% margin. Pricing sheet saved to the job's folder.`,
    };
  } catch (e) {
    const text = e instanceof GoogleError ? errorText(e) : (e as Error).message;
    return { ok: false, message: `Not priced. ${text}${sheetUrl ? " The pricing sheet that was started is in the job's folder if you want to look." : ""}` };
  }
}
