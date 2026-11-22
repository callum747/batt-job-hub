# What you need to do

**Forget the earlier list.** No Supabase, no Vercel, no GitHub. Just these.

---

## Now: Google Cloud (you and Cam, about 15 minutes)

This is what lets you both sign in with your Batt Google accounts, and later lets the app use Drive, Calendar and Gmail.

Sign in with a **@battelectrical.com** account throughout.

1. Go to **console.cloud.google.com**.
2. Click the project picker at the top, then **New project**.
   - Name: `Batt Job Hub`
   - Organisation: **battelectrical.com**
   - Click **Create**, then make sure `Batt Job Hub` is selected at the top.
3. In the search bar at the top, type **Google Auth Platform** and open it. Click **Get started**.
   - App name: `Batt Job Hub`
   - Support email: your Batt email
   - Audience: **Internal** (only Batt accounts can use it, and Google doesn't need to review it)
   - Contact email: your Batt email
   - Tick to agree, then **Create**.
4. On the left, click **Clients**, then **Create client**.
   - Application type: **Web application**
   - Name: `Batt Job Hub`
   - Leave the web address boxes empty for now. You'll fill one in later, when the app is on Replit.
   - Click **Create**.
5. Google shows a **Client ID** and a **Client secret**. Click **Download JSON** and keep the file somewhere safe. **Don't send these to Claude.** They go into Replit's Secrets later.
6. Switch on the services the app will use. Search the top bar for each one and click **Enable**:
   - Google Drive API
   - Google Docs API
   - Google Sheets API
   - Google Calendar API
   - Gmail API

When it's done, tell Claude **"Google is done"**.

If anything on screen doesn't match these steps, send Claude a screenshot.

---

## Also now: check your Replit plan (2 minutes)

Putting an app online on Replit needs a paid plan (**Replit Core** or above). If your website is already live on Replit, you almost certainly have it. Just check.

---

## Later: when Claude sends the zip (end of Phase 1)

Claude will walk you through this step by step at the time:

1. Create a new Replit project and upload the zip.
2. Paste one command into the Shell.
3. Add the Google Client ID and secret in Replit's **Secrets**.
4. Click **Deploy**, then paste the Replit address back into Google (step 4 above).
5. You and Cam sign in on your phones.

---

## Waiting on nothing else

Claude is building the jobs list, job screen, board, clients and search in the meantime.
