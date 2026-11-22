/** Only Google accounts on this domain may sign in. */
export const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || "battelectrical.com").toLowerCase();

/** True once the Google sign-in keys are set. */
export const authConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.NEXTAUTH_SECRET,
);

/** Local preview without sign-in. Only ever possible in development, never on the live site. */
export const previewMode = !authConfigured && process.env.NODE_ENV === "development";

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  return at > 0 && email.slice(at + 1).toLowerCase() === ALLOWED_DOMAIN;
}
