// Applies any database changes in db/migrations that haven't been applied yet.
// Usage: DATABASE_URL=... node scripts/migrate.mjs
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
const dir = path.join(process.cwd(), "db", "migrations");

// Every migration is written so it is safe to run again, and they all run on every start.
// So whatever state the database is in (new, half set up, or reset by the host), it ends up complete.
let failed = false;
try {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table schema_migrations enable row level security`;
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const text = await readFile(path.join(dir, f), "utf8");
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(text);
        await tx`insert into schema_migrations (name) values (${f}) on conflict (name) do nothing`;
      });
      console.log(`Checked ${f}`);
    } catch (e) {
      failed = true;
      console.error(`DATABASE SETUP FAILED in ${f}: ${e.message}${e.detail ? ` (${e.detail})` : ""}`);
      break;
    }
  }
  if (!failed) {
    const tables = await sql`select table_name from information_schema.tables where table_schema = current_schema() order by 1`;
    const [{ jobs }] = await sql`select count(*)::int as jobs from jobs`;
    console.log(`Database is up to date: ${tables.length} tables, ${jobs} jobs.`);
  }
} finally {
  await sql.end();
}
if (failed) process.exit(1);
