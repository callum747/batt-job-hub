"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentPerson } from "@/lib/auth";
import { sql } from "@/lib/db";
import { STAGES, type Stage, ukDate, todayUK } from "@/lib/jobs-rules";
import { audit, changeStage } from "@/lib/mutations";

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
    if (number) href = `/jobs/${number}`;
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
  return {
    number: r.number,
    numbered,
    message: numbered ? `Moved to ${stage}. This job is now #${r.number}.` : `Moved to ${stage}.`,
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
