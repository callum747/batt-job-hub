# Batt Job Hub: handover notes

How to run, deploy and look after the app.

## What it's built with
- **Next.js** (the app itself), written in TypeScript
- **Postgres** database (Replit's built-in database)
- **Google sign-in**, limited to the battelectrical.com Workspace (an "Internal" Google Cloud app, so only Batt accounts can ever use it)
- Hosted on **Replit**

## Settings (Secrets)
See `.env.example` for the full list: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ALLOWED_EMAIL_DOMAIN`.

In Google Cloud > Google Auth Platform > Clients > Batt Job Hub, the **Authorised redirect URI** must be
`https://<the app's address>/api/auth/callback/google`.

## Google Drive and Calendar
- Each person presses **Connect Google** once. Their permission is stored encrypted in the `google_tokens` table and the app acts in Google as them.
- The Google Cloud project needs these APIs switched on: Google Drive API and Google Calendar API (Docs, Sheets and Gmail are used by later phases).
- **Test mode and live** are in Settings. The folder and calendar IDs for both are in the `settings` table under the key `google`.
- The app only ever moves a job folder that is already in one of its four folders (Live, Lost, Active, Completed) for the mode it is in. Anything elsewhere is left alone.
- A visit's calendar entry is only changed or removed if it is on the calendar the app is currently using.

## Commands
- `npm install`: install everything
- `npm run migrate`: bring the database up to date (safe to run any time; the deployment does it on every start)
- `npm run import -- import-data`: bring in jobs, clients and visits from the old app's export. Safe to run again: it updates rather than duplicates.
- `npm run dev`: run it on your own computer
- `npm run build` then `npm start`: run it for real
- `npm test`: the money and job-number tests. Add `TEST_DATABASE_URL` pointing at an **empty, throwaway** database to include the database tests (they wipe that database).

## Without the Google settings
On a computer in development, the app opens as a preview with no sign-in. On the live site it refuses everyone and shows "Sign-in isn't switched on yet". It never runs open to the world.

## How data is protected
- Only the server talks to the database; the browser never does.
- Every change is recorded in the `audit_log` table: who, what and when.
- Jobs are never deleted; they're set to Lost or Closed.
- Job numbers are handed out inside a database lock, so they can never clash.

## Backups
Replit's database has its own restore points. Before any big change, also download a copy: in the Replit Shell, `pg_dump "$DATABASE_URL" > backup-$(date +%F).sql`. A proper nightly backup to Google Drive comes in the sweep phase.

## Where things are
- `db/migrations/`: the database layout, one numbered file per change
- `scripts/`: database updates and the import
- `src/lib/money.ts`: profit and margin (with tests beside it)
- `src/lib/jobs-rules.ts`: job numbers, stages, dates
- `src/lib/mutations.ts`: stage changes and job numbering
- `src/lib/google/`: Drive folders, calendar entries and the naming rules (with tests)
- `src/app/(app)/`: the screens
