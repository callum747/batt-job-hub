"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentPerson } from "@/lib/auth";
import { sql } from "@/lib/db";
import { STAGES, type Stage, ukDate, todayUK } from "@/lib/jobs-rules";
import { audit, changeStage } from "@/lib/mutations";
import { removeVisitEvent, syncVisit } from "@/lib/google/calendar";
import { errorText, getFileCheck, googleConnected, googleSettings, type GoogleArea } from "@/lib/google/client";
import { syncJobFolder } from "@/lib/google/drive";
import { loadPriceList, priceJob } from "@/lib/google/pricing-run";
import { buildShortQuote } from "@/lib/google/quote-run";
import type { ShortQuote } from "@/lib/quote-short";
import type { PricingInput } from "@/lib/pricing";

async function who() {
  const p = await currentPerson();
  if (!p) throw new Error("Please sign in again.");
  return p;
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const dateOrNull = (f: FormData, k: string) => {
  const v = text(f, k);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};
const moneyOrZero = (f: FormData, k: string) => {
  const v = Number(text(f, k).replace(/[£,\s]/g, ""));
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
};
const numberOrNull = (f: FormData, k: string) => {
  const raw = text(f, k);
  if (raw === "") return null;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : null;
};

function refreshJobs(href?: string) {
  revalidatePath("/", "layout");
  if (href) revalidatePath(href);
}

/** Finds the client by id, or creates one from a typed name. */
async function resolveClient(f: FormData): Promise<string | null> {
  const id = text(f, "client_id");
  if (id && id !== "new") return id;
  const name = text(f, "new_client");
  if (!name) return null;
  const [row] = await sql<{ id: string }[]>`
    insert into clients (name) values (${name}) on conflict (name) do update set name = excluded.name returning id`;
  return row.id;
}

export async function createJob(f: FormData) {
  const me = await who();
  const clientId = await resolveClient(f);
  const [job] = await sql<{ id: string }[]>`
    insert into jobs (client_id, site, postcode, type, description, contact, received, miles_round_trip, quote_value, stage)
    values (${clientId}, ${text(f, "site")}, ${text(f, "postcode").toUpperCase()}, ${text(f, "type")}, ${text(f, "description")},
      ${text(f, "contact")}, ${dateOrNull(f, "received") ?? todayUK()}, ${numberOrNull(f, "miles_round_trip")},
      ${moneyOrZero(f, "quote_value")}, 'Enquiry')
    returning id`;
  const people = f.getAll("people").map(String).filter(Boolean);
  for (const p of people) await sql`insert into job_people (job_id, person_id) values (${job.id}, ${p}) on conflict do nothing`;
  await audit(sql, me.email, "created", "job", job.id);

  const stage = text(f, "stage") as Stage;
  let href = `/jobs/${job.id}`;
  if (stage && stage !== "Enquiry" && STAGES.includes(stage)) {
    const { number } = await changeStage(job.id, stage, me.email);
    if (number) href = `/jobs/${number}?numbered=1`;
    await syncJobFolder(job.id, me.email);
  }
  refreshJobs();
  redirect(href);
}

export async function updateJob(jobId: string, f: FormData) {
  const me = await who();
  const clientId = await resolveClient(f);
  await sql`
    update jobs set client_id = ${clientId}, site = ${text(f, "site")}, postcode = ${text(f, "postcode").toUpperCase()},
      type = ${text(f, "type")}, description = ${text(f, "description")}, contact = ${text(f, "contact")},
      miles_round_trip = ${numberOrNull(f, "miles_round_trip")}, quote_value = ${moneyOrZero(f, "quote_value")},
      received = ${dateOrNull(f, "received")}, deadline = ${dateOrNull(f, "deadline")}, quoted_at = ${dateOrNull(f, "quoted_at")},
      outcome_at = ${dateOrNull(f, "outcome_at")}, outcome_reason = ${text(f, "outcome_reason")},
      start_date = ${dateOrNull(f, "start_date")}, end_date = ${dateOrNull(f, "end_date")},
      certs = ${text(f, "certs")}, building_control = ${text(f, "building_control")},
      drive_folder_url = ${text(f, "drive_folder_url")}, updated_at = now()
    where id = ${jobId} and merged_into is null`;
  await audit(sql, me.email, "edited", "job", jobId);
  refreshJobs();
  return { ok: true, message: "Job saved." };
}

export async function setStage(jobId: string, stage: Stage) {
  const me = await who();
  const r = await changeStage(jobId, stage, me.email);
  refreshJobs();
  const numbered = r.number !== null && r.numberBefore === null;
  const drive = await syncJobFolder(jobId, me.email);
  refreshJobs();
  return {
    number: r.number,
    numbered,
    message: [numbered ? `Moved to ${stage}. This job is now #${r.number}.` : `Moved to ${stage}.`, drive].filter(Boolean).join(" "),
  };
}

export async function setPeople(jobId: string, personIds: string[]) {
  const me = await who();
  await sql.begin(async (tx) => {
    await tx`delete from job_people where job_id = ${jobId}`;
    for (const p of personIds) await tx`insert into job_people (job_id, person_id) values (${jobId}, ${p})`;
    await tx`update jobs set updated_at = now() where id = ${jobId}`;
    await audit(tx, me.email, "people", "job", jobId, { people: personIds });
  });
  refreshJobs();
}

/** Adds a dated line to the job's running notes. History is never deleted. */
export async function addNote(jobId: string, f: FormData) {
  const me = await who();
  const note = text(f, "note").replace(/\s+/g, " ");
  if (!note) return;
  const first = me.name.split(" ")[0];
  const line = `${ukDate(todayUK())}: ${note} (${first})`;
  await sql`update jobs set notes = case when notes = '' then ${line} else notes || E'\n' || ${line} end, updated_at = now() where id = ${jobId}`;
  await audit(sql, me.email, "note", "job", jobId, { note });
  refreshJobs();
}

export async function addVariation(jobId: string, f: FormData) {
  const me = await who();
  const description = text(f, "description");
  if (!description) return;
  await sql`insert into variations (job_id, description, amount, approved, date)
    values (${jobId}, ${description}, ${moneyOrZero(f, "amount")}, ${f.get("approved") === "on"}, ${dateOrNull(f, "date") ?? todayUK()})`;
  await audit(sql, me.email, "extra added", "job", jobId, { description });
  refreshJobs();
}

export async function setVariationApproved(id: string, approved: boolean) {
  const me = await who();
  const [v] = await sql<{ job_id: string }[]>`update variations set approved = ${approved} where id = ${id} returning job_id`;
  if (v) await audit(sql, me.email, approved ? "extra approved" : "extra unapproved", "job", v.job_id, { variation: id });
  refreshJobs();
}

export async function deleteVariation(id: string) {
  const me = await who();
  const [v] = await sql<{ job_id: string; description: string; amount: number }[]>`delete from variations where id = ${id} returning job_id, description, amount`;
  if (v) await audit(sql, me.email, "extra removed", "job", v.job_id, v);
  refreshJobs();
}

export async function saveClient(clientId: string | null, f: FormData) {
  const me = await who();
  const name = text(f, "name");
  if (!name) return { ok: false, message: "The client needs a name." };
  const days = numberOrNull(f, "payment_days");
  const fields = {
    name,
    type: text(f, "type"),
    contact: text(f, "contact"),
    email: text(f, "email"),
    phone: text(f, "phone"),
    billing_address: text(f, "billing_address"),
    payment_days: days === null ? null : Math.round(days),
    notes: text(f, "notes"),
  };
  try {
    if (clientId) {
      await sql`update clients set ${sql(fields)}, updated_at = now() where id = ${clientId}`;
      await audit(sql, me.email, "edited", "client", clientId);
    } else {
      const [c] = await sql<{ id: string }[]>`insert into clients ${sql(fields)} returning id`;
      await audit(sql, me.email, "created", "client", c.id);
      refreshJobs();
      redirect(`/clients/${c.id}`);
    }
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { ok: false, message: `There's already a client called ${name}.` };
    throw e;
  }
  refreshJobs();
  return { ok: true, message: "Client saved." };
}

export async function savePerson(personId: string, f: FormData) {
  const me = await who();
  const colour = text(f, "colour");
  await sql`update people set full_name = ${text(f, "full_name")}, email = ${text(f, "email")}, role = ${text(f, "role")},
    day_cost = ${moneyOrZero(f, "day_cost")}, colour = ${/^#[0-9a-f]{6}$/i.test(colour) ? colour : "#5A6470"}
    where id = ${personId}`;
  await audit(sql, me.email, "edited", "person", personId);
  refreshJobs();
  return { ok: true, message: "Saved." };
}

export async function saveMargins(f: FormData) {
  const me = await who();
  const green = moneyOrZero(f, "green");
  const red = moneyOrZero(f, "red");
  if (red >= green) return { ok: false, message: "The red level must be below the green level." };
  await sql`update settings set value = ${sql.json({ green, red })}, updated_at = now() where key = 'margins'`;
  await audit(sql, me.email, "edited", "settings", "margins", { green, red });
  refreshJobs();
  return { ok: true, message: "Margin colours saved." };
}

export async function retryJobFolder(jobId: string) {
  const me = await who();
  const message = await syncJobFolder(jobId, me.email);
  refreshJobs();
  return { message: message || "The Drive folder is where it should be." };
}

const timeOrNull = (f: FormData, k: string) => {
  const v = text(f, k);
  return /^\d{2}:\d{2}$/.test(v) ? v : null;
};

export async function saveVisit(visitId: string | null, f: FormData) {
  const me = await who();
  const date = dateOrNull(f, "date");
  if (!date) return { ok: false, message: "The visit needs a date." };
  const jobId = text(f, "job_id") || null;
  const start = timeOrNull(f, "start");
  const end = start ? timeOrNull(f, "end") : null;
  if (start && end && end <= start) return { ok: false, message: "The finish time must be after the start time." };
  const people = f.getAll("people").map(String).filter(Boolean);
  const fields = {
    job_id: jobId,
    date,
    start_time: start,
    end_time: end,
    work: text(f, "work"),
    site: text(f, "site"),
    confirmed: f.get("pencilled") !== "on",
    notes: text(f, "notes"),
  };
  const id = await sql.begin(async (tx) => {
    let vid = visitId;
    if (vid) {
      await tx`update visits set ${tx(fields)}, updated_at = now() where id = ${vid}`;
    } else {
      const [row] = await tx<{ id: string }[]>`insert into visits ${tx(fields)} returning id`;
      vid = row.id;
    }
    await tx`delete from visit_people where visit_id = ${vid}`;
    for (const p of people) await tx`insert into visit_people (visit_id, person_id) values (${vid}, ${p})`;
    await audit(tx, me.email, visitId ? "visit changed" : "visit booked", "visit", vid!, { date, jobId });
    return vid!;
  });
  const calendar = await syncVisit(id, me.email);
  refreshJobs();
  return { ok: true, message: `Visit ${visitId ? "saved" : "booked"}. ${calendar}` };
}

/** Planner drag: move a visit to another day and/or swap one person for another. */
export async function moveVisit(visitId: string, date: string, fromPerson: string | null, toPerson: string | null) {
  const me = await who();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { message: "That isn't a date." };
  await sql.begin(async (tx) => {
    await tx`update visits set date = ${date}, updated_at = now() where id = ${visitId}`;
    if (fromPerson !== toPerson) {
      if (fromPerson) await tx`delete from visit_people where visit_id = ${visitId} and person_id = ${fromPerson}`;
      if (toPerson) await tx`insert into visit_people (visit_id, person_id) values (${visitId}, ${toPerson}) on conflict do nothing`;
    }
    await audit(tx, me.email, "visit moved", "visit", visitId, { date, fromPerson, toPerson });
  });
  const calendar = await syncVisit(visitId, me.email);
  refreshJobs();
  return { message: `Visit moved. ${calendar}` };
}

export async function deleteVisit(visitId: string) {
  const me = await who();
  const [v] = await sql<{ calendar_event_id: string; calendar_id: string; date: string; job_id: string | null }[]>`
    select calendar_event_id, calendar_id, date, job_id from visits where id = ${visitId}`;
  if (!v) return { ok: true, message: "Already removed." };
  try {
    await removeVisitEvent(v, me.email);
  } catch (e) {
    if (v.calendar_event_id) return { ok: false, message: `Visit not removed, because its calendar entry couldn't be removed: ${errorText(e)}` };
  }
  await sql`delete from visits where id = ${visitId}`;
  await audit(sql, me.email, "visit removed", "visit", visitId, { date: v.date, jobId: v.job_id });
  refreshJobs();
  return { ok: true, message: v.calendar_event_id ? "Visit removed, and taken out of the calendar." : "Visit removed." };
}

export async function retryVisitCalendar(visitId: string) {
  const me = await who();
  const message = await syncVisit(visitId, me.email);
  refreshJobs();
  return { message };
}

export async function setGoogleMode(mode: "test" | "live") {
  const me = await who();
  if (mode !== "test" && mode !== "live") return { ok: false, message: "Unknown mode." };
  await sql`update settings set value = jsonb_set(value, '{mode}', to_jsonb(${mode}::text)), updated_at = now() where key = 'google'`;
  await audit(sql, me.email, "google mode", "settings", "google", { mode });
  refreshJobs();
  return {
    ok: true,
    message: mode === "live" ? "The app now works in the real job folders and the real shared calendar." : "The app is back in the test folder and test calendar.",
  };
}

export type Check = { label: string; ok: boolean; detail: string };

/** Tries each thing the app needs in Google and reports what works, in plain words. */
export async function checkGoogle(): Promise<Check[]> {
  const me = await who();
  const out: Check[] = [];
  const connected = await googleConnected(me.email);
  out.push({ label: "Your Google permission", ok: connected, detail: connected ? `Connected as ${me.email}` : "Not connected. Press Connect Google." });
  if (!connected) return out;
  const s = await googleSettings();
  for (const which of ["test", "live"] as const) {
    for (const area of ["Live", "Lost", "Active", "Completed"] as GoogleArea[]) {
      const r = await getFileCheck(me.email, s[which].folders[area]);
      out.push({ label: `${which === "test" ? "Test" : "Real"} folder: ${area}`, ok: r.ok, detail: r.detail });
    }
  }
  const cal = await getFileCheck(me.email, s.live.calendarId, "calendar");
  out.push({ label: "Real shared calendar", ok: cal.ok, detail: cal.detail });
  if (s.test.calendarId) {
    const t = await getFileCheck(me.email, s.test.calendarId, "calendar");
    out.push({ label: "Test calendar", ok: t.ok, detail: t.detail });
  } else {
    out.push({ label: "Test calendar", ok: true, detail: "Will be made the first time a visit is booked in test mode." });
  }
  return out;
}

export async function runPricing(jobId: string, input: PricingInput) {
  const me = await who();
  const clean: PricingInput = {
    items: (input.items ?? []).map((it) => ({
      area: String(it.area ?? ""),
      key: it.key === null ? null : String(it.key),
      description: String(it.description ?? ""),
      qty: Number(it.qty),
      ...(it.key === null ? { materialEach: Number(it.materialEach), hoursEach: Number(it.hoursEach) } : {}),
    })),
    miles: Number(input.miles),
    people: Math.round(Number(input.people)),
    vans: Math.round(Number(input.vans)),
    parking: Number(input.parking) || 0,
    waste: Number(input.waste) || 0,
    access: Number(input.access) || 0,
    other: Number(input.other) || 0,
    oneElectrician: Boolean(input.oneElectrician),
  };
  const r = await priceJob(jobId, clean, me);
  refreshJobs();
  return r;
}

export async function refreshPriceList() {
  const me = await who();
  try {
    const { products } = await loadPriceList(me.email, true);
    refreshJobs();
    return { ok: true, message: `Price list refreshed: ${products.length} products.` };
  } catch (e) {
    return { ok: false, message: errorText(e) };
  }
}

export async function makeQuote(jobId: string, q: ShortQuote) {
  const me = await who();
  const str = (v: unknown) => String(v ?? "");
  const num = (v: unknown) => Number(v);
  const clean: ShortQuote = {
    number: num(q.number),
    client: str(q.client),
    project: str(q.project),
    site: str(q.site),
    date: str(q.date),
    validUntil: str(q.validUntil),
    preparedBy: { name: str(q.preparedBy?.name), title: str(q.preparedBy?.title), email: str(q.preparedBy?.email) },
    summary: str(q.summary),
    installation: str(q.installation),
    schedule: (q.schedule ?? []).map((g) => ({ area: str(g.area), items: (g.items ?? []).map((i) => ({ item: str(i.item), ref: str(i.ref), works: str(i.works) })) })),
    investment: (q.investment ?? []).map((l) => ({ section: str(l.section), description: str(l.description), amount: num(l.amount) })),
    subtotal: num(q.subtotal),
    vat: num(q.vat),
    total: num(q.total),
    deposit: Boolean(q.deposit),
    paymentDays: Math.round(num(q.paymentDays)),
    exclusions: (q.exclusions ?? []).map(str),
    assumptions: (q.assumptions ?? []).map(str),
  };
  const r = await buildShortQuote(jobId, clean, me);
  refreshJobs();
  return r;
}
