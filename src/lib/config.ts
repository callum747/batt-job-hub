/** Only Google accounts on this domain may sign in. */
export const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || "battelectrical.com").toLowerCase();

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** True once the Supabase keys are set. Until then the app can only be previewed locally. */
export const authConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Local preview without sign-in. Only ever possible in development, never on the live site. */
export const previewMode = !authConfigured && process.env.NODE_ENV === "development";

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  return at > 0 && email.slice(at + 1).toLowerCase() === ALLOWED_DOMAIN;
}
