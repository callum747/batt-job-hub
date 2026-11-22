# Batt Job Hub: handover notes

How to run, deploy and look after the app.

## What it's built with
- **Next.js** (the app itself), written in TypeScript
- **Supabase** for the database and sign-in
- **Vercel** to host it
- **Google sign-in**, restricted to the battelectrical.com Workspace

## Running it on a computer
1. Install Node.js 22.
2. `npm install`
3. Copy `.env.example` to `.env.local` and fill in the values.
4. `npm run dev`, then open http://localhost:3000

Without the Supabase values the app opens in a preview with no sign-in. That preview only works on your own computer, never on the live site: the live site refuses everyone until sign-in is set up.

## Setting up sign-in (one-off)
1. **Supabase**: create a project (London region). Under Authentication > Providers, turn on Google.
2. **Google Cloud** (Cam, as Workspace admin): create a project owned by Batt, set the OAuth consent screen to **Internal**, and create an OAuth client ID (Web application). Authorised redirect URI: `https://<supabase project>.supabase.co/auth/v1/callback`.
3. Paste the Google client ID and secret into Supabase's Google provider.
4. In Supabase > Authentication > URL configuration, set the Site URL to the live address and add `https://<live address>/auth/callback` to the redirect URLs.
5. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel.

The app checks the email domain itself as well, so a non-Batt account is signed straight back out.

## Deploying
Vercel deploys automatically every time code is pushed to the `main` branch on GitHub. Other branches get their own preview address.

## Backups
To follow once the database is in use (Phase 1).
