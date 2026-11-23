# Putting the Job Hub on Replit

About 20 minutes. Do it on a laptop. If any screen looks different from these steps, send Claude a screenshot.

You need:
- the zip file Claude sent (`batt-job-hub-phase-1.zip`)
- the JSON file you downloaded from Google Cloud

---

## 1. Make the project

1. In Replit, click **Create App** (or **+ Create**).
2. Choose to start from a **blank / empty** project. If it asks for a template, pick **Node.js**. Call it `batt-job-hub`.
3. If Replit's AI Agent offers to build something, say no or close it. **Don't let the Replit Agent change this app.**

## 2. Upload the code

1. Open the **Files** panel on the left.
2. Drag `batt-job-hub-phase-1.zip` into it.
3. Open the **Shell** tab and paste this, then press Enter:

```
unzip -o batt-job-hub-phase-1.zip && rm batt-job-hub-phase-1.zip && ls
```

You should see a list including `package.json`, `src` and `import-data`.

## 3. Add a database

1. Open the **Database** tool (search the Tools list for "Database" or "PostgreSQL") and click **Create a database**.
2. Replit sets `DATABASE_URL` for you. Nothing to copy.

## 4. Add the Secrets

1. Open the **Secrets** tool (padlock icon).
2. Open the Google JSON file in any text editor. Find `client_id` and `client_secret`.
3. Add these secrets one at a time (name on the left, value on the right):

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | the `client_id` from the JSON file |
| `GOOGLE_CLIENT_SECRET` | the `client_secret` from the JSON file |
| `NEXTAUTH_SECRET` | paste `openssl rand -base64 32` into the Shell, press Enter, and copy what it prints |
| `ALLOWED_EMAIL_DOMAIN` | `battelectrical.com` |
| `ANTHROPIC_API_KEY` | for the Ask screen: a key from console.anthropic.com (API Keys). Optional; Ask says how to switch it on if it's missing |

`NEXTAUTH_URL` comes in step 6, once you know the web address.

## 5. Set up and load your jobs

In the **Shell**, paste this and press Enter. It takes a couple of minutes:

```
npm install && npm run migrate && npm run import -- import-data
```

At the end it should say: **Imported. The database now has 49 jobs, 11 clients and 14 visits.**

## 6. Put it online

1. Click **Deploy** (top right). Choose **Autoscale** if asked. The build and run commands are already filled in from the zip.
2. Before the first deploy finishes, or straight after, Replit shows the app's web address, something like `https://batt-job-hub.replit.app`. Copy it.
3. Back in **Secrets**, add `NEXTAUTH_URL` = that address (no slash on the end).
4. Make sure the deployment can see the secrets and the database. Replit usually copies them across; if the deployment settings show a separate list of secrets, add the same ones there.
5. Redeploy if Replit asks.

## 7. Tell Google the address

1. Go to **console.cloud.google.com**, project **Batt Job Hub** > **Google Auth Platform** > **Clients** > **Batt Job Hub**.
2. Under **Authorised redirect URIs**, click **Add URI** and paste the app address followed by `/api/auth/callback/google`, for example:
   `https://batt-job-hub.replit.app/api/auth/callback/google`
3. Click **Save**. Google says it can take a few minutes to work.

## 8. Sign in

Open the app address on your phone and laptop, tap **Sign in with Google**, and pick your Batt account. Then get Cam to do the same.

If the Jobs page is empty after signing in, tell Claude: the deployment may be using a separate production database, and the import needs running against that one.

---

**Updates later:** Claude sends a new zip. You upload it, paste the unzip command from step 2, then click **Deploy** again. Your jobs stay in the database and aren't touched.
