import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { sql } from "../db";

/** What the app needs from Google: files in Drive (Docs and Sheets included) and the calendar. */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/calendar",
];
const NEEDED = GOOGLE_SCOPES.slice(3);

const API = process.env.GOOGLE_API_BASE || "https://www.googleapis.com";
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";

/** An error with a message written for Callum and Cam, not for a developer. */
export class GoogleError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

export const NOT_CONNECTED = "Google Drive and Calendar aren't connected for you yet. Open Settings and press Connect Google.";

function key() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new GoogleError("The app's sign-in secret isn't set.");
  return createHash("sha256").update(secret).digest();
}

export function encrypt(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}

export function decrypt(packed: string) {
  const [iv, tag, body] = packed.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}

export async function saveRefreshToken(email: string, refreshToken: string, scopes: string) {
  await sql`
    insert into google_tokens (email, refresh_token_enc, scopes) values (${email.toLowerCase()}, ${encrypt(refreshToken)}, ${scopes})
    on conflict (email) do update set refresh_token_enc = excluded.refresh_token_enc, scopes = excluded.scopes, updated_at = now()`;
  cache.delete(email.toLowerCase());
}

/** True when this person has given the app Drive and Calendar permission. */
export async function googleConnected(email: string) {
  const [row] = await sql<{ scopes: string }[]>`select scopes from google_tokens where email = ${email.toLowerCase()}`;
  if (!row) return false;
  const have = row.scopes.split(/\s+/);
  return NEEDED.every((s) => have.includes(s));
}

const cache = new Map<string, { token: string; expires: number }>();

async function accessToken(email: string) {
  const who = email.toLowerCase();
  const hit = cache.get(who);
  if (hit && hit.expires > Date.now() + 60_000) return hit.token;
  const [row] = await sql<{ refresh_token_enc: string }[]>`select refresh_token_enc from google_tokens where email = ${who}`;
  if (!row) throw new GoogleError(NOT_CONNECTED, 401);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: decrypt(row.refresh_token_enc),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) {
    if (data.error === "invalid_grant") {
      await sql`delete from google_tokens where email = ${who}`;
      throw new GoogleError("Google needs connecting again. Open Settings and press Connect Google.", 401);
    }
    throw new GoogleError(`Google wouldn't sign the app in (${data.error ?? res.status}).`, res.status);
  }
  cache.set(who, { token: data.access_token, expires: Date.now() + (data.expires_in ?? 3000) * 1000 });
  return data.access_token;
}

type Query = Record<string, string | number | boolean | undefined>;

/** Calls a Google API as the given person and returns the JSON. */
export async function google<T>(
  email: string,
  path: string,
  opts: { method?: string; query?: Query; body?: unknown } = {},
): Promise<T> {
  const token = await accessToken(email);
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, ...(opts.body ? { "content-type": "application/json" } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) {
    const detail = data.error?.message ?? `error ${res.status}`;
    if (res.status === 401) throw new GoogleError("Google needs connecting again. Open Settings and press Connect Google.", 401);
    if (res.status === 404 || res.status === 410) throw new GoogleError("Google couldn't find that file, folder or calendar entry.", res.status);
    if (res.status === 403) throw new GoogleError(`Google didn't allow that: ${detail}`, 403);
    throw new GoogleError(`Google said: ${detail}`, res.status);
  }
  return data as T;
}

export type GoogleArea = "Live" | "Lost" | "Active" | "Completed";
export type GoogleSettings = {
  mode: "test" | "live";
  live: { folders: Record<GoogleArea, string>; calendarId: string };
  test: { folders: Record<GoogleArea, string>; calendarId: string };
};

export async function googleSettings(): Promise<GoogleSettings> {
  const [row] = await sql<{ value: GoogleSettings }[]>`select value from settings where key = 'google'`;
  if (!row) throw new GoogleError("The Google settings are missing from the database.");
  return row.value;
}

export const errorText = (e: unknown) => (e instanceof GoogleError ? e.message : `Something went wrong talking to Google: ${(e as Error).message}`);

/** Read-only look at a folder or calendar, for the connection check in Settings. */
export async function getFileCheck(email: string, id: string, kind: "folder" | "calendar" = "folder") {
  try {
    if (kind === "calendar") {
      const c = await google<{ summary: string }>(email, `/calendar/v3/calendars/${encodeURIComponent(id)}`);
      return { ok: true, detail: `Found "${c.summary}"` };
    }
    const f = await google<{ name: string; capabilities?: { canAddChildren?: boolean } }>(email, `/drive/v3/files/${encodeURIComponent(id)}`, {
      query: { supportsAllDrives: true, fields: "name,capabilities(canAddChildren)" },
    });
    return f.capabilities?.canAddChildren === false
      ? { ok: false, detail: `Found "${f.name}", but you can't add folders to it` }
      : { ok: true, detail: `Found "${f.name}"` };
  } catch (e) {
    return { ok: false, detail: errorText(e) };
  }
}
