import "server-only";
/**
 * Road miles from Batt's registered office to a site and back, from Google Maps (Routes API).
 * Out and back are asked for separately because one-way streets make them differ. Uses the
 * GOOGLE_MAPS_API_KEY secret, not a person's Google sign-in.
 */

export const BASE = "18 Alwin Close, Aylesbury, HP21 8RP";
export const mapsConfigured = () => Boolean(process.env.GOOGLE_MAPS_API_KEY);

const ROUTES = process.env.GOOGLE_ROUTES_URL || "https://routes.googleapis.com/directions/v2:computeRoutes";

async function metres(from: string, to: string): Promise<number> {
  const res = await fetch(ROUTES, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY ?? "", "X-Goog-FieldMask": "routes.distanceMeters" },
    body: JSON.stringify({ origin: { address: from }, destination: { address: to }, travelMode: "DRIVE", regionCode: "GB" }),
  });
  const data = (await res.json().catch(() => ({}))) as { routes?: { distanceMeters?: number }[]; error?: { message?: string; status?: string; details?: { reason?: string }[] } };
  if (!res.ok) {
    const why = data.error?.message ?? `error ${res.status}`;
    if (res.status === 403 || res.status === 400) {
      const fix = keyFix(data.error?.details?.map((d) => d.reason ?? "").join(" ") + " " + why);
      if (fix || res.status === 403) throw new Error(`Google Maps turned the key down. ${fix || `Google said: ${why} Check the Routes API is enabled, billing is on, and the key is allowed to use the Routes API.`}`);
    }
    throw new Error(`Google Maps couldn't work that out: ${why}`);
  }
  const m = data.routes?.[0]?.distanceMeters;
  if (!m) throw new Error(`Google Maps couldn't find a driving route to "${to}". Check the address and postcode.`);
  return m;
}

/** Which of the Google Cloud settings is wrong, from the reason Google gives. Empty if it doesn't say. */
export function keyFix(reason: string): string {
  if (/SERVICE_DISABLED|has not been used in project|it is disabled/i.test(reason)) return "The Routes API isn't switched on in the Google Cloud project the key belongs to. Fix: APIs & Services, Library, search Routes API, press Enable. Make sure the project named at the top of the page is the one the key was made in.";
  if (/BILLING_DISABLED|billing/i.test(reason)) return "The Google Cloud project has no billing account linked. Fix: Billing, link a billing account to the project.";
  if (/API_KEY_SERVICE_BLOCKED|not authorized to use this (service|API)|are blocked/i.test(reason)) return "The key's own settings don't allow the Routes API. Fix: APIs & Services, Credentials, click the key, and under API restrictions choose Don't restrict key (or tick Routes API), then Save.";
  if (/API_KEY_HTTP_REFERRER_BLOCKED|API_KEY_IP_ADDRESS_BLOCKED|API_KEY_ANDROID_APP_BLOCKED|API_KEY_IOS_APP_BLOCKED|referer|referrer|IP address/i.test(reason)) return "The key is limited to certain websites or addresses, and the app's server isn't one of them. Fix: APIs & Services, Credentials, click the key, and under Application restrictions choose None, then Save.";
  if (/API_KEY_INVALID|API key not valid|expired/i.test(reason)) return "The key in Replit Secrets isn't a valid key. Fix: copy the key again from APIs & Services, Credentials, paste it into GOOGLE_MAPS_API_KEY in Replit Secrets with no spaces, and Republish.";
  return "";
}

const toMiles = (m: number) => m / 1609.344;

export type Miles = { roundTrip: number; out: number; back: number; to: string };

/** Round-trip road miles to an address, to the nearest whole mile (as Batt's quotes state them). */
export async function roundTripMiles(address: string): Promise<Miles> {
  if (!mapsConfigured()) throw new Error("Google Maps isn't set up: GOOGLE_MAPS_API_KEY is missing from Replit Secrets.");
  const to = address.trim();
  if (to.length < 5) throw new Error("Add the site's address or postcode first.");
  const [out, back] = await Promise.all([metres(BASE, to), metres(to, BASE)]);
  const p1 = (n: number) => Math.round(n * 10) / 10;
  return { roundTrip: Math.round(toMiles(out + back)), out: p1(toMiles(out)), back: p1(toMiles(back)), to };
}

/** The address to look up for a job: the site with its postcode, or just the postcode if the site line is a description. */
export function jobAddress(job: { site: string; postcode: string }): string {
  const site = job.site.trim();
  const pc = job.postcode.trim();
  if (!pc) return site;
  return site.toUpperCase().includes(pc.toUpperCase()) ? site : site ? `${site}, ${pc}` : pc;
}
