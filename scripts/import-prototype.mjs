// Brings in jobs, clients and visits exported from the old Claude app.
// Safe to run more than once: records are matched on the old app's id and updated.
// Usage: DATABASE_URL=... node scripts/import-prototype.mjs path/to/data-folder
import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
const dir = process.argv[2];
if (!url || !dir) {
  console.error("Usage: DATABASE_URL=... node scripts/import-prototype.mjs <folder with jobs.json, clients.json, visits.json>");
  process.exit(1);
}

const load = async (f) => JSON.parse(await readFile(path.join(dir, f), "utf8"));
const [jobs, clients, visits] = await Promise.all([load("jobs.json"), load("clients.json"), load("visits.json")]);

const d = (s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const t = (s) => (s && /^\d{1,2}:\d{2}$/.test(s) ? s : null);
const folderId = (u) => (u || "").match(/folders\/([A-Za-z0-9_-]+)/)?.[1] ?? "";
const STAGES = new Set(["Enquiry", "Draft quote", "Quoted", "Booked", "In progress", "Complete", "Invoiced", "Paid", "On hold", "Lost", "Closed"]);

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  await sql.begin(async (tx) => {
    const people = Object.fromEntries((await tx`select id, short_name from people`).map((p) => [p.short_name, p.id]));
    const personId = (name) => {
      const id = people[name];
      if (!id) throw new Error(`Unknown person "${name}". Add them in Settings first.`);
      return id;
    };

    // Clients
    const clientIds = {};
    for (const c of clients) {
      const days = /^\d+$/.test(String(c.terms ?? "")) ? Number(c.terms) : null;
      const [row] = await tx`
        insert into clients (legacy_id, name, type, contact, email, phone, billing_address, payment_days, notes)
        values (${c._id}, ${c.name}, ${c.type ?? ""}, ${c.contact ?? ""}, ${c.email ?? ""}, ${c.phone ?? ""}, ${c.address ?? ""}, ${days}, ${c.notes ?? ""})
        on conflict (legacy_id) do update set name = excluded.name, type = excluded.type, contact = excluded.contact,
          email = excluded.email, phone = excluded.phone, billing_address = excluded.billing_address,
          payment_days = excluded.payment_days, notes = excluded.notes, updated_at = now()
        returning id`;
      clientIds[c.name] = row.id;
    }

    // Jobs
    const jobIds = {};
    for (const j of jobs) {
      if (!STAGES.has(j.stage)) throw new Error(`Job ${j._id} has an unknown stage "${j.stage}".`);
      const no = String(j.no ?? "").trim();
      const number = /^\d+$/.test(no) ? Number(no) : null;
      const legacyRef = number === null && no !== "TBC" ? no : "";
      const clientId = j.client ? clientIds[j.client] : null;
      if (j.client && !clientId) throw new Error(`Job ${j._id} names a client that isn't in clients.json: "${j.client}".`);
      const also = (j.also ?? []).map(Number).filter(Number.isFinite);
      const [row] = await tx`
        insert into jobs (legacy_id, number, legacy_ref, also, stage, client_id, site, postcode, type, description, contact,
          quote_value, received, deadline, quoted_at, outcome_at, outcome_reason, start_date, end_date, certs, building_control,
          drive_folder_id, drive_folder_url, links, notes)
        values (${j._id}, ${number}, ${legacyRef}, ${also}, ${j.stage}, ${clientId}, ${j.site ?? ""}, ${j.postcode ?? ""}, ${j.type ?? ""},
          ${j.desc ?? ""}, ${j.contact ?? ""}, ${Number(j.value) || 0}, ${d(j.received)}, ${d(j.deadline)}, ${d(j.submitted)},
          ${d(j.outcome)}, ${j.reason ?? ""}, ${d(j.start)}, ${d(j.end)}, ${j.certs ?? ""}, ${j.bc ?? ""},
          ${folderId(j.folder)}, ${j.folder ?? ""}, ${tx.json(j.links ?? [])}, ${j.notes ?? ""})
        on conflict (legacy_id) do update set number = excluded.number, legacy_ref = excluded.legacy_ref, also = excluded.also,
          stage = excluded.stage, client_id = excluded.client_id, site = excluded.site, postcode = excluded.postcode,
          type = excluded.type, description = excluded.description, contact = excluded.contact, quote_value = excluded.quote_value,
          received = excluded.received, deadline = excluded.deadline, quoted_at = excluded.quoted_at, outcome_at = excluded.outcome_at,
          outcome_reason = excluded.outcome_reason, start_date = excluded.start_date, end_date = excluded.end_date,
          certs = excluded.certs, building_control = excluded.building_control, drive_folder_id = excluded.drive_folder_id,
          drive_folder_url = excluded.drive_folder_url, links = excluded.links, notes = excluded.notes, updated_at = now()
        returning id`;
      jobIds[j._id] = row.id;

      await tx`delete from job_people where job_id = ${row.id}`;
      for (const name of j.engineers ?? []) {
        await tx`insert into job_people (job_id, person_id) values (${row.id}, ${personId(name)})`;
      }
      await tx`delete from variations where job_id = ${row.id}`;
      for (const v of j.variations ?? []) {
        await tx`insert into variations (job_id, description, amount, approved, date)
          values (${row.id}, ${v.desc ?? ""}, ${Number(v.amount) || 0}, ${Boolean(v.approved)}, ${d(v.date)})`;
      }
    }
    for (const j of jobs) {
      if (j.mergedInto) {
        const target = jobIds[j.mergedInto];
        if (!target) throw new Error(`Job ${j._id} is merged into ${j.mergedInto}, which isn't in the export.`);
        await tx`update jobs set merged_into = ${target} where id = ${jobIds[j._id]}`;
      }
    }

    // Visits
    for (const v of visits) {
      const jobId = v.jobId ? jobIds[v.jobId] : null;
      if (v.jobId && !jobId) throw new Error(`Visit ${v._id} is on job ${v.jobId}, which isn't in the export.`);
      if (!d(v.date)) throw new Error(`Visit ${v._id} has no valid date.`);
      const [row] = await tx`
        insert into visits (legacy_id, job_id, date, start_time, end_time, work, site, confirmed, calendar_event_id, calendar_link, notes)
        values (${v._id}, ${jobId}, ${v.date}, ${t(v.start)}, ${t(v.end)}, ${v.work ?? ""}, ${v.site ?? ""}, ${v.confirmed !== "No"},
          ${v.eventId ?? ""}, ${v.eventLink ?? ""}, ${v.notes ?? ""})
        on conflict (legacy_id) do update set job_id = excluded.job_id, date = excluded.date, start_time = excluded.start_time,
          end_time = excluded.end_time, work = excluded.work, site = excluded.site, confirmed = excluded.confirmed,
          calendar_event_id = excluded.calendar_event_id, calendar_link = excluded.calendar_link, notes = excluded.notes, updated_at = now()
        returning id`;
      await tx`delete from visit_people where visit_id = ${row.id}`;
      for (const name of v.engineers ?? []) {
        await tx`insert into visit_people (visit_id, person_id) values (${row.id}, ${personId(name)})`;
      }
    }

    await tx`insert into audit_log (actor, action, entity, detail)
      values ('import', 'imported', 'prototype', ${tx.json({ jobs: jobs.length, clients: clients.length, visits: visits.length })})`;
  });

  const [{ jobs: nj, clients: nc, visits: nv }] =
    await sql`select (select count(*) from jobs)::int jobs, (select count(*) from clients)::int clients, (select count(*) from visits)::int visits`;
  console.log(`Imported. The database now has ${nj} jobs, ${nc} clients and ${nv} visits.`);
} finally {
  await sql.end();
}
